import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { SUGGESTED_REPLIES } from "../constants/llm-constants";
import { SENTIMENT_THRESHOLDS } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ConsideredDuplicateCandidate } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { UsersService } from "../users/users.service";
import {
  canonicaliseCategoryName,
  parseCategoryName,
} from "../utils/category-name.util";
import { buildAnalyzedEmailSnapshot } from "./analyzed-email-snapshot.helper";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import { persistLlmCategoryWithPrecedence } from "./category-column-updates.helper";
import { buildLlmCategoryOutcome } from "./category-decision-trace.helper";
import type { CategoryDecisionAnalyzedEmail } from "./category-decision-trace.types";
import {
  makeCategoryContextIdLookup,
  preferRuleCategoryWhenNameUnresolved,
} from "./category-lookup.helper";
import {
  buildCategoryResolutionLog,
  logCategoryResolution,
  ShortlistCandidateLog,
} from "./category-resolution-log.helper";
import { applyDirectProtoMatch } from "./direct-proto-match.helper";
import { applyEmergencyDelivery } from "./emergency-delivery.helper";
import { calculateScoreContributions } from "./score-contributions.helper";

type PriorityLlmResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  /** @deprecated Sentiment now comes from the summary LLM call. May be absent. */
  sentimentScore?: number;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  /** @deprecated Category now comes from the summary LLM call. May be absent. */
  category?: string;
  /** @deprecated Category explanation now comes from the summary LLM call. May be absent. */
  categoryExplanation?: string;
  protoCategorySuggestion?: { name: string; description: string };
  /** Category names passed to the smart model after shortlisting. Null when shortlisting was skipped. */
  shortlistedCategoryNames?: string[] | null;
  // ── Instrumentation (optional; populated by the single/numbered analyse path) ──
  /** Confidence the LLM assigned to its category pick. */
  categoryConfidence?: string;
  /** Raw 1-based categoryNumber the LLM chose (0 = Other), before index resolution. */
  categoryNumber?: number | null;
  /** Shortlisted candidates with embedding score + platform-pinned provenance. */
  shortlistCandidates?: ShortlistCandidateLog[] | null;
  /** Total categories (real + proto) the user had at decision time. */
  totalCategoryCount?: number;
  /** Proto categories the user had at decision time. */
  protoCategoryCount?: number;
  /**
   * Snapshot of the deterministic-rule step at processing time. Undefined on
   * paths that do not run rules (e.g. batch priority) so the column is left
   * untouched; set (possibly with a null winner) by the single-email refiner.
   */
  categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
  /** Authoritative categoryId from a matched rule; used directly so a renamed category name no longer files to Other. */
  ruleCategoryId?: string | null;
  /** What content the priority LLM was given for this email (AI summary vs cleaned body). Set by the single-email refiner. */
  analyzedContentSource?: CategoryDecisionAnalyzedEmail["contentSource"];
};

type PriorityBreakdownItem = {
  factor: string;
  value: number;
  description: string;
};

type PriorityDimensions = {
  urgency: { score: number; reasons: string[] };
  goalAlignment: { score: number; reasons: string[] };
  vipContact: { score: number; reasons: string[] };
  sentiment: { score: number; type: string; reasons: string[] };
};

type PriorityExplanationPayload = {
  score: number;
  breakdown: PriorityBreakdownItem[];
  dimensions: PriorityDimensions;
  calculatedAt: string;
};

// Constants for priority result computation
const PRIORITY_RESULT_CONSTANTS = {
  SUBSTRING_PREVIEW_LENGTH: 8,
} as const;

const CHECKS_STATE_FAILING = "failing";
const GITHUB_AUTHOR_TYPE_BOT = "Bot";
const FAILING_CHECKS_PREVIEW_COUNT = 2;
const FAILING_CI_PRIORITY_BUMP = 20;

/**
 * Domain service for applying and computing LLM priority results.
 * Handles priority breakdown, dimensions, category resolution, and proto-categories.
 * Extracted from LLMProcessor (Phase 7b, issue #939).
 */
@Injectable()
export class LLMPriorityResultService {
  private readonly logger = new Logger(LLMPriorityResultService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly protoCategoriesService: ProtoCategoriesService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly backgroundSummaryQueueService: BackgroundSummaryQueueService,
  ) {}

  async applyPriorityResult(
    email: Email,
    llmResult: PriorityLlmResult,
    contexts: Array<{ contextKey: string; contextValue: string }>,
    userId: string,
    workerId: string,
  ): Promise<number> {
    let thread: EmailThread | null = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }

    // Resolve the connected GitHub login once so calculatePriorityBreakdown
    // can bump priority on failing CI for the user's own PRs and so the
    // category override below can match against requested-reviewer lists.
    const user = await this.usersService.findOne(userId);
    const githubUsername = user?.githubUsername ?? null;

    const { breakdown, dimensions, finalScore } =
      this.calculatePriorityBreakdown(
        email,
        llmResult,
        contexts,
        thread,
        githubUsername,
      );

    const priorityExplanation = {
      score: finalScore,
      breakdown,
      dimensions,
      calculatedAt: new Date().toISOString(),
    };

    if (llmResult.sentimentScore !== undefined) {
      await this.emailRepository.update(
        { id: email.id },
        { sentimentScore: llmResult.sentimentScore },
      );
    }

    if (email.emailThreadId && thread) {
      await this.persistPriorityToThread({
        email,
        thread,
        llmResult,
        contexts,
        userId,
        workerId,
        finalScore,
        priorityExplanation,
      });
      // LLM path: the downstream pipeline (category/sentiment/action items) and
      // the prioritisation prompt depend on the summary, so always summarise —
      // gating only applies where priority was decided WITHOUT the LLM.
      await this.backgroundSummaryQueueService.queueBackgroundSummary({
        userId,
        emailId: email.id,
        threadId: email.emailThreadId,
      });
    }

    return finalScore;
  }

  private async persistPriorityToThread(args: {
    email: Email;
    thread: EmailThread;
    llmResult: PriorityLlmResult;
    contexts: Array<{ contextKey: string; contextValue: string }>;
    userId: string;
    workerId: string;
    finalScore: number;
    priorityExplanation: PriorityExplanationPayload;
  }): Promise<void> {
    const {
      email,
      thread,
      llmResult,
      contexts,
      userId,
      workerId,
      finalScore,
      priorityExplanation,
    } = args;

    const emailThreadId = email.emailThreadId as string;
    const urgencyUpdate = this.computeUrgencyUpdate(thread, llmResult);

    const {
      finalCategory,
      protoCategoryId,
      categoryId,
      decisionTrace,
      resolvedCategoryExplanation,
    } = await this.resolveCategoryOutcome({
      email,
      thread,
      llmResult,
      contexts,
      userId,
      workerId,
      emailThreadId,
    });

    await this.emailThreadRepository.update(
      { id: emailThreadId },
      {
        urgencyScore: urgencyUpdate.score,
        urgencyExplanation:
          urgencyUpdate.explanation || thread.urgencyExplanation,
        priorityExplanation,
        priorityScore: finalScore,
        prioritySource: "llm" as const,
        isProcessingPriority: false,
        aiProcessingDeferred: false,
        shortlistedCategoryNames: llmResult.shortlistedCategoryNames ?? null,
      },
    );

    await persistLlmCategoryWithPrecedence(
      this.emailThreadRepository,
      this.logger,
      {
        emailThreadId,
        workerId,
        ruleCategoryId: llmResult.ruleCategoryId ?? null,
        categoryRuleTrace: llmResult.categoryRuleTrace,
        categoryId,
        finalCategory,
        protoCategoryId,
        resolvedCategoryExplanation,
        decisionTrace,
      },
    );

    await this.maybeApplyEmergencyDelivery({
      emailThreadId,
      userId,
      finalScore,
      starCount: thread.starCount ?? 0,
      isBatched: thread.isBatched ?? true,
      urgencyScore: llmResult.urgencyScore || 0,
    });

    this.logger.log(
      `[Worker ${workerId}] Updated thread ${emailThreadId.substring(0, PRIORITY_RESULT_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... priorityScore: ${finalScore}`,
    );
  }

  /**
   * Resolve the category/proto-category for the thread and build the
   * persistable outcome (categoryId, decision trace, honest explanation).
   * Warns when a resolved category name has no matching UUID.
   */
  private async resolveCategoryOutcome(args: {
    email: Email;
    thread: EmailThread;
    llmResult: PriorityLlmResult;
    contexts: Array<{ contextKey: string; contextValue: string }>;
    userId: string;
    workerId: string;
    emailThreadId: string;
  }): Promise<
    {
      finalCategory: string | null;
      protoCategoryId: string | null;
    } & ReturnType<typeof buildLlmCategoryOutcome>
  > {
    const { email, thread, llmResult, contexts, userId, workerId } = args;
    const knownCategoryNames = contexts
      .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
      .map((ctx) => parseCategoryName(ctx.contextValue));

    const {
      finalCategory,
      protoCategoryId,
      categoryId: llmCategoryId,
    } = await this.resolveCategoryAndProtoCategory({
      email,
      thread,
      llmResult,
      userId,
      workerId,
      knownCategoryNames,
      contexts: contexts as UserContext[],
    });

    if (llmCategoryId === null && finalCategory && finalCategory !== "Other") {
      this.logger.warn(
        `[Worker ${workerId}] Thread ${args.emailThreadId}: resolved category "${finalCategory}" but no matching UUID found — categoryId will be null`,
      );
    }

    const outcome = buildLlmCategoryOutcome({
      decidedAt: new Date().toISOString(),
      finalCategory,
      llmCategoryId,
      protoCategoryId,
      categoryExplanation:
        llmResult.categoryExplanation || thread.categoryExplanation || null,
      rawLlmCategory: llmResult.category ?? null,
      llmProtoSuggestionName: llmResult.protoCategorySuggestion?.name ?? null,
      analyzedEmail: await buildAnalyzedEmailSnapshot(
        this.emailRepository,
        email,
        userId,
        llmResult.analyzedContentSource,
      ),
    });

    return { finalCategory, protoCategoryId, ...outcome };
  }

  private computeUrgencyUpdate(
    thread: EmailThread,
    llmResult: PriorityLlmResult,
  ): { score: number; explanation: string | null } {
    const threadScore = thread.urgencyScore || 0;
    const llmScore = llmResult.urgencyScore || 0;
    const explanation =
      llmScore > threadScore
        ? llmResult.urgencyExplanation
        : thread.urgencyExplanation;
    return { score: Math.max(threadScore, llmScore), explanation };
  }

  private async maybeApplyEmergencyDelivery(args: {
    emailThreadId: string;
    userId: string;
    finalScore: number;
    starCount: number;
    isBatched: boolean;
    urgencyScore: number;
  }): Promise<void> {
    await applyEmergencyDelivery(this.emailThreadRepository, args);
  }

  calculatePriorityBreakdown(
    email: Email,
    llmResult: PriorityLlmResult,
    contexts: Array<{ contextKey: string; contextValue: string }>,
    thread: EmailThread | null,
    githubUsername: string | null = null,
  ): {
    breakdown: PriorityBreakdownItem[];
    dimensions: PriorityDimensions;
    finalScore: number;
  } {
    const contributions = calculateScoreContributions(llmResult);
    const { urgencyScore, goalAlignmentScore, sentimentScore } = contributions;

    const breakdown: PriorityBreakdownItem[] = [
      {
        factor: "🔥 Urgency",
        value: contributions.urgencyContribution,
        description: llmResult.urgencyExplanation || "Urgency analysis",
      },
      {
        factor: "🎯 Goal Alignment",
        value: contributions.goalAlignmentContribution,
        description:
          llmResult.goalAlignmentExplanation || "Goal alignment analysis",
      },
      {
        factor: "😊 Sentiment",
        value: contributions.sentimentContribution,
        description: this.getSentimentDescription(sentimentScore),
      },
    ];

    const vipContacts = contexts.filter(
      (contact) => contact.contextKey === ContextKey.VIP_CONTACT,
    );
    const matchedVip = vipContacts.find(
      (vip) =>
        email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );
    if (matchedVip) {
      breakdown.push({
        factor: "⭐ VIP Contact",
        value: 25,
        description: `From VIP: ${matchedVip.contextValue}`,
      });
    }

    if (email.senderJobTitle) {
      const jobTitleLower = email.senderJobTitle.toLowerCase();
      const highPriorityTitles = [
        "ceo",
        "president",
        "director",
        "manager",
        "lead",
        "head",
      ];
      if (highPriorityTitles.some((title) => jobTitleLower.includes(title))) {
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: 15,
          description: `Sender role: ${email.senderJobTitle}`,
        });
      }
    }

    if (email.isRead && thread && thread.starCount === 0) {
      breakdown.push({
        factor: "📖 Read Status",
        value: -15,
        description: "Already read and not starred",
      });
    }

    const failingCiOnOwnPr = this.detectFailingCiOnOwnPr(
      thread,
      githubUsername,
    );
    if (failingCiOnOwnPr) {
      breakdown.push({
        factor: "💥 CI failing on your PR",
        value: FAILING_CI_PRIORITY_BUMP,
        description: failingCiOnOwnPr,
      });
    }

    const finalScore = breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );

    const dimensions = this.buildPriorityDimensions(
      llmResult,
      matchedVip,
      urgencyScore,
      goalAlignmentScore,
      sentimentScore,
    );

    return { breakdown, dimensions, finalScore };
  }

  /**
   * Detect failing CI on a PR authored by the connected user. Returns a
   * human-readable description for the priority breakdown, or null when the
   * condition doesn't apply (thread isn't a PR, CI isn't failing, the user
   * isn't the author, etc.).
   *
   * Bot-authored PRs are deliberately excluded — failing CI on Renovate is
   * noise, not a signal to escalate priority.
   */
  private detectFailingCiOnOwnPr(
    thread: EmailThread | null,
    githubUsername: string | null,
  ): string | null {
    if (!thread?.githubMetadata?.links?.length || !githubUsername) {
      return null;
    }
    const lowerLogin = githubUsername.toLowerCase();
    for (const link of thread.githubMetadata.links) {
      const { status } = link;
      if (!status || status.checks?.state !== CHECKS_STATE_FAILING) {
        continue;
      }
      const { author } = status;
      if (!author || author.type === GITHUB_AUTHOR_TYPE_BOT) {
        continue;
      }
      if (author.login.toLowerCase() !== lowerLogin) {
        continue;
      }

      const failing = status.checks.failingChecks ?? [];
      const preview =
        failing.slice(0, FAILING_CHECKS_PREVIEW_COUNT).join(", ") || "CI";
      return `${preview} failing on ${link.owner}/${link.repo}#${link.number}`;
    }
    return null;
  }

  buildPriorityDimensions(
    llmResult: PriorityLlmResult,
    matchedVip: { contextValue: string } | undefined,
    urgencyScore: number,
    goalAlignmentScore: number,
    sentimentScore: number,
  ): PriorityDimensions {
    return {
      urgency: {
        score: urgencyScore,
        reasons: [llmResult.urgencyExplanation || "No urgency explanation"],
      },
      goalAlignment: {
        score: goalAlignmentScore,
        reasons: [
          llmResult.goalAlignmentExplanation || "No goal alignment explanation",
        ],
      },
      vipContact: {
        score: matchedVip ? SUGGESTED_REPLIES.REPLY_MAX_TOKENS : 0,
        reasons: matchedVip ? [`VIP contact: ${matchedVip.contextValue}`] : [],
      },
      sentiment: {
        score: sentimentScore,
        type: this.getSentimentType(sentimentScore),
        reasons: [],
      },
    };
  }

  /**
   * Fuzzy-routes an UNresolved, NON-confident LLM category into a matching proto (the "LLM returned
   * a proto's name" case). Deliberately skipped for a category the LLM picked from the user's real
   * categories, or a HIGH-confidence pick, so it can't be collapsed into a near-neighbour proto like
   * "New GitHub issues (bot-created)" and auto-promoted over it (the ~400-thread GitHub mis-routing).
   */
  private async maybeApplyProtoMatch(options: {
    resolvedLlmResult: PriorityLlmResult;
    email: Email;
    userId: string;
    workerId: string;
    finalCategory: string | null;
    categoryId: string | null;
    protoCategoryId: string | null;
    lookupCategoryContextId: (name: string | null) => string | null;
  }): Promise<{
    finalCategory: string | null;
    categoryId: string | null;
    protoCategoryId: string | null;
    usedProtoMatch: boolean;
  }> {
    const {
      resolvedLlmResult,
      email,
      userId,
      workerId,
      lookupCategoryContextId,
    } = options;
    let { finalCategory, categoryId, protoCategoryId } = options;
    let usedProtoMatch = false;

    if (
      categoryId === null &&
      resolvedLlmResult.category &&
      resolvedLlmResult.category !== "Other" &&
      resolvedLlmResult.categoryConfidence !== "HIGH" &&
      email.emailThreadId
    ) {
      const matchResult = await applyDirectProtoMatch(
        {
          protoCategoriesService: this.protoCategoriesService,
          logger: this.logger,
        },
        {
          categoryName: resolvedLlmResult.category,
          emailThreadId: email.emailThreadId,
          userId,
          workerId,
          lookupCategoryContextId,
        },
      );
      if (matchResult) {
        usedProtoMatch = true;
        ({ finalCategory, categoryId, protoCategoryId } = matchResult);
      }
    }

    return { finalCategory, categoryId, protoCategoryId, usedProtoMatch };
  }

  async resolveCategoryAndProtoCategory({
    email,
    thread,
    llmResult,
    userId,
    workerId,
    knownCategoryNames = [],
    contexts = [],
  }: {
    email: Email;
    thread: EmailThread;
    llmResult: PriorityLlmResult;
    userId: string;
    workerId: string;
    knownCategoryNames?: string[];
    contexts?: UserContext[];
  }): Promise<{
    finalCategory: string | null;
    protoCategoryId: string | null;
    categoryId: string | null;
  }> {
    const resolvedLlmResult =
      llmResult.category && llmResult.category !== "Other"
        ? {
            ...llmResult,
            category: canonicaliseCategoryName(
              llmResult.category,
              knownCategoryNames,
            ),
          }
        : llmResult;

    let finalCategory = resolvedLlmResult.category || null;
    let protoCategoryId: string | null =
      finalCategory === "Other" ? (thread.protoCategoryId ?? null) : null;

    const lookupCategoryContextId = makeCategoryContextIdLookup(contexts);

    let categoryId: string | null = lookupCategoryContextId(finalCategory);
    let usedProtoMatch = false;

    // Prefer a matched rule's authoritative categoryId when its name no longer
    // resolves, so it isn't dropped to Other (before proto-match, pre-empting a fuzzy re-route).
    ({ categoryId, finalCategory } = preferRuleCategoryWhenNameUnresolved(
      categoryId,
      finalCategory,
      contexts,
      resolvedLlmResult.ruleCategoryId,
    ));

    ({ finalCategory, categoryId, protoCategoryId, usedProtoMatch } =
      await this.maybeApplyProtoMatch({
        resolvedLlmResult,
        email,
        userId,
        workerId,
        finalCategory,
        categoryId,
        protoCategoryId,
        lookupCategoryContextId,
      }));

    if (
      resolvedLlmResult.category === "Other" &&
      resolvedLlmResult.protoCategorySuggestion?.name
    ) {
      const resolved = await this.applyProtoSuggestion({
        email,
        llmResult: resolvedLlmResult,
        userId,
        workerId,
        finalCategory,
        protoCategoryId,
        lookupCategoryContextId,
      });
      ({ finalCategory, protoCategoryId, categoryId } = resolved);
    }

    const guarded = this.applyPriorityOverOtherGuard({
      finalCategory,
      categoryId,
      protoCategoryId,
      llmResult,
      knownCategoryNames,
      emailThreadId: email.emailThreadId,
      workerId,
      lookupCategoryContextId,
    });

    logCategoryResolution(
      this.logger,
      buildCategoryResolutionLog({
        userId,
        // Provider thread id (matches the debug UI + DB threadId column) — not
        // the EmailThread UUID. Fall back to the email's copy of the same id.
        threadId: thread.threadId ?? email.threadId ?? null,
        llmResult,
        canonicalisedCategory: resolvedLlmResult.category ?? null,
        resolved: guarded,
        usedProtoMatch,
        knownCategoryNames,
      }),
    );

    return guarded;
  }

  private applyPriorityOverOtherGuard(options: {
    finalCategory: string | null;
    categoryId: string | null;
    protoCategoryId: string | null;
    llmResult: PriorityLlmResult;
    knownCategoryNames: string[];
    emailThreadId: string | undefined;
    workerId: string;
    lookupCategoryContextId: (name: string | null) => string | null;
  }): {
    finalCategory: string | null;
    protoCategoryId: string | null;
    categoryId: string | null;
  } {
    const {
      llmResult,
      knownCategoryNames,
      emailThreadId,
      workerId,
      lookupCategoryContextId,
    } = options;
    let { finalCategory, categoryId, protoCategoryId } = options;
    // Don't override when the email was deliberately routed to a proto category
    // (protoCategoryId set): the direct-proto-match path intentionally leaves
    // finalCategory as "Other" while tracking the proto. Overriding here would
    // wipe protoCategoryId and falsely report "category not found → Other".
    if (
      (!finalCategory || finalCategory === "Other") &&
      !protoCategoryId &&
      llmResult.category &&
      llmResult.category !== "Other"
    ) {
      const canonicalised = canonicaliseCategoryName(
        llmResult.category,
        knownCategoryNames,
      );
      if (canonicalised && canonicalised !== "Other") {
        finalCategory = canonicalised;
        categoryId = lookupCategoryContextId(finalCategory);
        protoCategoryId = null;
        this.logger.debug(
          `[Worker ${workerId}] Priority-over-Other guard: preferring priority category "${finalCategory}" over summary "Other" for thread ${emailThreadId}`,
        );
      }
    }
    return { finalCategory, protoCategoryId, categoryId };
  }

  async applyProtoSuggestion({
    email,
    llmResult,
    userId,
    workerId,
    finalCategory,
    protoCategoryId,
    lookupCategoryContextId = () => null,
  }: {
    email: Email;
    llmResult: PriorityLlmResult;
    userId: string;
    workerId: string;
    finalCategory: string | null;
    protoCategoryId: string | null;
    lookupCategoryContextId?: (name: string | null) => string | null;
  }): Promise<{
    finalCategory: string | null;
    protoCategoryId: string | null;
    categoryId: string | null;
  }> {
    const suggestionName = llmResult.protoCategorySuggestion!.name;
    // Records the categories the dedup pass weighed (and the LLM's reasoning),
    // so a newly created proto category can store what it considered duplicates.
    const consideredCandidates: ConsideredDuplicateCandidate[] = [];
    try {
      const matchingFullCategory =
        await this.protoCategoriesService.findMatchingFullCategory(
          userId,
          suggestionName,
          consideredCandidates,
        );

      if (matchingFullCategory) {
        this.logger.log(
          `[Worker ${workerId}] Proto category suggestion "${suggestionName}" matches existing category "${matchingFullCategory.name}", assigning directly`,
        );
        return {
          finalCategory: matchingFullCategory.name,
          protoCategoryId: null,
          categoryId: matchingFullCategory.contextId,
        };
      }

      const existingProtoCategory =
        await this.protoCategoriesService.findMatchingProtoCategory(
          userId,
          suggestionName,
          consideredCandidates,
        );

      if (existingProtoCategory) {
        const updatedProtoCategory =
          await this.protoCategoriesService.assignThreadToProtoCategory(
            existingProtoCategory.id,
            email.emailThreadId,
          );

        if (updatedProtoCategory.isPromoted) {
          this.logger.log(
            `[Worker ${workerId}] Proto category "${updatedProtoCategory.name}" was promoted to real category`,
          );
          return {
            finalCategory: updatedProtoCategory.name,
            protoCategoryId: null,
            categoryId: lookupCategoryContextId(updatedProtoCategory.name),
          };
        }
        this.logger.log(
          `[Worker ${workerId}] Assigned thread to existing proto category "${updatedProtoCategory.name}" (count: ${updatedProtoCategory.emailCount})`,
        );
        return {
          finalCategory,
          protoCategoryId: updatedProtoCategory.id,
          categoryId: lookupCategoryContextId(finalCategory),
        };
      }

      const newProtoCategory =
        await this.protoCategoriesService.createAndAssignToThread(
          userId,
          suggestionName,
          llmResult.protoCategorySuggestion!.description || null,
          email.emailThreadId,
          consideredCandidates,
        );

      this.logger.log(
        `[Worker ${workerId}] Created new proto category "${newProtoCategory.name}"`,
      );
      return {
        finalCategory,
        protoCategoryId: newProtoCategory.id,
        categoryId: lookupCategoryContextId(finalCategory),
      };
    } catch (protoCategoryError) {
      this.logger.warn(
        `[Worker ${workerId}] Failed to process proto category for email ${email.id}:`,
        protoCategoryError,
      );
      return {
        finalCategory,
        protoCategoryId,
        categoryId: lookupCategoryContextId(finalCategory),
      };
    }
  }

  getSentimentType(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) {
      return "negative";
    }
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) {
      return "positive";
    }
    return "neutral";
  }

  getSentimentDescription(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) {
      return `Negative sentiment (${score.toFixed(2)})`;
    }
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) {
      return `Positive sentiment (${score.toFixed(2)})`;
    }
    return "Neutral sentiment";
  }

  extractEmailAddress(from: string): string {
    if (!from) return "";
    const match = from.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase().trim();
    return from.toLowerCase().trim();
  }
}
