import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  EMAIL_CLASSIFICATION,
  SUGGESTED_REPLIES,
} from "../constants/llm-constants";
import {
  NEWSLETTER_DISCOUNT,
  PRIORITY_SCORES,
  SENTIMENT_THRESHOLDS,
} from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { GitHubCategoryOverrideService } from "../github/github-category-override.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";

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
  SENTIMENT_MULTIPLIER: 30,
  URGENCY_NEUTRAL: 50,
  URGENCY_MULTIPLIER: 0.5,
  GOAL_ALIGNMENT_WEIGHT: 0.4,
  OTHER_FACTORS_WEIGHT: 0.3,
  MAX_SCORE: 100,
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
    @Inject(forwardRef(() => GitHubCategoryOverrideService))
    private readonly githubCategoryOverrideService: GitHubCategoryOverrideService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async applyPriorityResult(
    email: Email,
    llmResult: PriorityLlmResult,
    contexts: Array<{ contextKey: string; contextValue: string }>,
    userId: string,
    workerId: string,
  ): Promise<void> {
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
        githubUsername,
        finalScore,
        priorityExplanation,
      });
    }
  }

  private async persistPriorityToThread(args: {
    email: Email;
    thread: EmailThread;
    llmResult: PriorityLlmResult;
    contexts: Array<{ contextKey: string; contextValue: string }>;
    userId: string;
    workerId: string;
    githubUsername: string | null;
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
      githubUsername,
      finalScore,
      priorityExplanation,
    } = args;

    const emailThreadId = email.emailThreadId as string;

    const urgencyUpdate = this.computeUrgencyUpdate(thread, llmResult);

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
        `[Worker ${workerId}] Thread ${emailThreadId}: resolved category "${finalCategory}" but no matching UUID found — categoryId will be null`,
      );
    }

    // GitHub-derived overrides win over LLM-picked categories. The metadata
    // processor applies the same override after its fetch — this branch
    // covers the race where LLM priority lands after metadata so we don't
    // clobber the reserved-category assignment.
    const githubOverrideCategoryId =
      await this.githubCategoryOverrideService.resolveOverrideCategoryId(
        userId,
        thread.githubMetadata?.links,
        githubUsername,
      );
    const categoryId = githubOverrideCategoryId ?? llmCategoryId;

    const resolvedCategoryExplanation = this.buildHonestCategoryExplanation(
      llmResult.categoryExplanation || thread.categoryExplanation || null,
      finalCategory,
      categoryId,
    );

    await this.emailThreadRepository.update(
      { id: emailThreadId },
      {
        urgencyScore: urgencyUpdate.score,
        urgencyExplanation:
          urgencyUpdate.explanation || thread.urgencyExplanation,
        priorityExplanation,
        priorityScore: finalScore,
        ...(categoryId !== null && categoryId !== undefined
          ? { categoryId }
          : {}),
        categoryExplanation: resolvedCategoryExplanation,
        // Track which step last set the category (debug field for issue #1509)
        ...(finalCategory && finalCategory !== "Other"
          ? { categorySource: "priority" as const }
          : {}),
        protoCategoryId,
        isProcessingPriority: false,
        aiProcessingDeferred: false,
        shortlistedCategoryNames: llmResult.shortlistedCategoryNames ?? null,
      },
    );

    await this.maybeApplyEmergencyDelivery(
      emailThreadId,
      userId,
      finalScore,
      thread.starCount ?? 0,
      thread.isBatched ?? true,
    );

    this.logger.log(
      `[Worker ${workerId}] Updated thread ${emailThreadId.substring(0, PRIORITY_RESULT_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... priorityScore: ${finalScore}`,
    );
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

  private async maybeApplyEmergencyDelivery(
    emailThreadId: string,
    userId: string,
    finalScore: number,
    starCount: number,
    isBatched: boolean,
  ): Promise<void> {
    // Starred + already delivered (was visible in Action/Follow-Up before the email arrived): no-op.
    if (starCount > 0 && !isBatched) return;
    if (finalScore < PRIORITY_SCORES.HIGH_THRESHOLD) return;
    await this.emailThreadRepository.update(
      { id: emailThreadId, userId },
      {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: true,
        batchDecisionReason: `Emergency delivery (score ${finalScore})`,
      },
    );
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
    const contributions = this.calculateScoreContributions(llmResult);
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

  calculateScoreContributions(llmResult: PriorityLlmResult): {
    urgencyScore: number;
    goalAlignmentScore: number;
    sentimentScore: number;
    urgencyContribution: number;
    goalAlignmentContribution: number;
    sentimentContribution: number;
  } {
    const goalAlignmentScore = llmResult.goalAlignmentScore || 0;
    const sentimentScore = llmResult.sentimentScore ?? 0;
    const urgencyScore = llmResult.urgencyScore || 0;

    const isNewsletterCategory = NEWSLETTER_DISCOUNT.CATEGORY_PATTERNS.some(
      (pattern) => (llmResult.category || "").toLowerCase().includes(pattern),
    );

    let sentimentContribution = 0;
    if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
      sentimentContribution = Math.round(
        -sentimentScore * PRIORITY_RESULT_CONSTANTS.SENTIMENT_MULTIPLIER,
      );
    }

    let urgencyContribution = Math.round(
      (urgencyScore - PRIORITY_RESULT_CONSTANTS.URGENCY_NEUTRAL) *
        EMAIL_CLASSIFICATION.COST_PER_TOKEN,
    );

    let goalAlignmentContribution = Math.round(
      goalAlignmentScore * PRIORITY_RESULT_CONSTANTS.GOAL_ALIGNMENT_WEIGHT,
    );

    if (isNewsletterCategory) {
      urgencyContribution = Math.round(
        urgencyContribution * NEWSLETTER_DISCOUNT.URGENCY_MULTIPLIER,
      );
      goalAlignmentContribution = Math.round(
        goalAlignmentContribution *
          NEWSLETTER_DISCOUNT.GOAL_ALIGNMENT_MULTIPLIER,
      );
    }

    return {
      urgencyScore,
      goalAlignmentScore,
      sentimentScore,
      urgencyContribution,
      goalAlignmentContribution,
      sentimentContribution,
    };
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

  canonicaliseCategoryName(rawName: string, knownNames: string[]): string {
    if (!rawName || rawName === "Other") return rawName;
    const exact = knownNames.find(
      (knownName) => knownName.toLowerCase() === rawName.toLowerCase(),
    );
    if (exact) return exact;
    const withoutParens = rawName
      .replace(/\s*\(.*\)\s*$/, "")
      .trim()
      .toLowerCase();
    const parenMatch = knownNames.find(
      (knownName) => knownName.toLowerCase() === withoutParens,
    );
    if (parenMatch) return parenMatch;
    const prefixCandidates = knownNames.filter(
      (knownName) =>
        rawName.toLowerCase().startsWith(knownName.toLowerCase()) ||
        knownName.toLowerCase().startsWith(rawName.toLowerCase()),
    );
    if (prefixCandidates.length > 0) {
      return prefixCandidates.reduce((longest, candidate) =>
        candidate.length > longest.length ? candidate : longest,
      );
    }
    return rawName;
  }

  private async applyDirectProtoMatch(options: {
    categoryName: string;
    emailThreadId: string;
    userId: string;
    workerId: string;
    lookupCategoryContextId: (name: string | null) => string | null;
  }): Promise<{
    finalCategory: string | null;
    categoryId: string | null;
    protoCategoryId: string | null;
  } | null> {
    const {
      categoryName,
      emailThreadId,
      userId,
      workerId,
      lookupCategoryContextId,
    } = options;
    try {
      const directProtoMatch =
        await this.protoCategoriesService.findMatchingProtoCategory(
          userId,
          categoryName,
        );
      if (!directProtoMatch) return null;
      const updatedProto =
        await this.protoCategoriesService.assignThreadToProtoCategory(
          directProtoMatch.id,
          emailThreadId,
        );
      this.logger.log(
        `[Worker ${workerId}] Batch: LLM returned proto-category name directly: "${categoryName}" — re-routed`,
      );
      if (updatedProto.isPromoted) {
        const resolvedCategory = updatedProto.name;
        return {
          finalCategory: resolvedCategory,
          categoryId: lookupCategoryContextId(resolvedCategory),
          protoCategoryId: null,
        };
      }
      return {
        finalCategory: "Other",
        categoryId: null,
        protoCategoryId: updatedProto.id,
      };
    } catch (err) {
      this.logger.warn(
        `[Worker ${workerId}] Batch: Failed defensive proto-category check for "${categoryName}":`,
        err,
      );
      return null;
    }
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
            category: this.canonicaliseCategoryName(
              llmResult.category,
              knownCategoryNames,
            ),
          }
        : llmResult;

    let finalCategory = resolvedLlmResult.category || null;
    let protoCategoryId: string | null =
      finalCategory === "Other" ? (thread.protoCategoryId ?? null) : null;

    const lookupCategoryContextId =
      this.createLookupCategoryContextId(contexts);

    let categoryId: string | null = lookupCategoryContextId(finalCategory);

    if (
      resolvedLlmResult.category &&
      resolvedLlmResult.category !== "Other" &&
      email.emailThreadId
    ) {
      const matchResult = await this.applyDirectProtoMatch({
        categoryName: resolvedLlmResult.category,
        emailThreadId: email.emailThreadId,
        userId,
        workerId,
        lookupCategoryContextId,
      });
      if (matchResult) {
        ({ finalCategory, categoryId, protoCategoryId } = matchResult);
      }
    }

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

    return guarded;
  }

  private createLookupCategoryContextId(
    contexts: UserContext[],
  ): (name: string | null) => string | null {
    return (name: string | null): string | null => {
      if (!name || name === "Other") return null;
      const nameLower = name.toLowerCase().trim();
      const exact = contexts.find((context) => {
        if (context.contextKey !== ContextKey.EMAIL_CATEGORY) return false;
        if (
          context.categoryKey &&
          context.categoryKey.toLowerCase() === nameLower
        ) {
          return true;
        }
        const ctxName = parseCategoryName(context.contextValue).toLowerCase();
        return ctxName === nameLower;
      });
      return exact?.contextId ?? null;
    };
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
    if (
      (!finalCategory || finalCategory === "Other") &&
      llmResult.category &&
      llmResult.category !== "Other"
    ) {
      const canonicalised = this.canonicaliseCategoryName(
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
    try {
      const matchingFullCategory =
        await this.protoCategoriesService.findMatchingFullCategory(
          userId,
          suggestionName,
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

  /**
   * Build an honest categoryExplanation: when the priority path resolved
   * a non-Other category but categoryId is still null (no matching UserContext),
   * append a disambiguation note so the debug panel shows why this email is in Other.
   */
  buildHonestCategoryExplanation(
    explanation: string | null,
    finalCategory: string | null,
    categoryId: string | null,
  ): string | null {
    if (
      categoryId === null &&
      finalCategory &&
      finalCategory !== "Other" &&
      explanation
    ) {
      return `${explanation} (Note: category "${finalCategory}" not found in your category list — email placed in Other)`;
    }
    return explanation;
  }
}
