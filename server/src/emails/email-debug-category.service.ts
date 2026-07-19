import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { CategoryShortlistService } from "../llm/category-shortlist.service";
import {
  buildRuleMatchText,
  cleanEmailContent,
} from "../llm/email-content-cleaner";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import type { LocalModelDebugSnapshot } from "../local-model/local-model.types";
import { protoCategoryKey } from "../utils/category-key.util";
import {
  parseCategoryValue,
  resolveCategoryName,
} from "../utils/category-name.util";
import type { CategoryDecisionTrace } from "./category-decision-trace.types";

/** Cap on the thread-timeline list in the debug payload — threads longer than this keep only the newest entries (the recent tail is what staleness questions are about). */
const THREAD_TIMELINE_LIMIT = 50;

export interface CategoryDebugData {
  email: {
    emailId: string;
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
    receivedAt: string | null;
  };
  /**
   * Every email in the thread (oldest first, capped), so the debug view can
   * show WHICH message each pipeline step saw. The categoriser only analyses
   * ONE email's content per run, so knowing the thread's timeline vs the
   * analysed email is essential to understanding a stale category.
   */
  threadEmails: Array<{
    emailId: string;
    from: string;
    fromName: string;
    subject: string;
    receivedAt: string | null;
    /** True for the email this debug view was opened from. */
    isDebugTarget: boolean;
    /** True for the newest email in the thread. */
    isLatest: boolean;
  }>;
  thread: {
    category: string | null;
    categoryExplanation: string | null;
    categorySource: "user" | "rule" | "local" | "priority" | "summary" | null;
    /** Category names that were shortlisted and passed to the smart model during the last priority analysis. Null means shortlisting was not applicable or not yet run. */
    shortlistedCategoryNames: string[] | null;
    /** What the deterministic-rule step saw when this thread's category was last set by priority analysis. Null for older threads or categories set by summarization. */
    categoryRuleTrace: CategoryRuleTraceSnapshot | null;
    /** What the local model predicted vs the LLM, and which decided. Null until the local model has scored this thread. */
    localModelDebug: LocalModelDebugSnapshot | null;
    /** Ordered record of every step that produced a category candidate and whether it was applied or suppressed (e.g. a GitHub override re-routing a confident category). Null for threads categorised before this existed. */
    categoryDecisionTrace: CategoryDecisionTrace | null;
  };
  emailCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string | null;
  }>;
  protoCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
  /**
   * Present when `deep` was requested: deterministic rules, shortlist pass, and a fresh smart-model run.
   * The smart step may invoke shortlisting again internally (same as production priority analysis).
   */
  categorizationTrace?: CategorizationTrace;
}

export interface CategorizationTrace {
  deterministicRules: Awaited<
    ReturnType<CategoryRulesService["getDeterministicRulesDebug"]>
  >;
  shortlist: {
    skipped: boolean;
    skipReason?: string;
    categoryNames: string[];
    error?: string;
  };
  smartModel: {
    category: string;
    categoryExplanation: string;
    categoryConfidence?: string;
    error?: string;
    /** When a deterministic rule won, the LLM's category before production overrides it. */
    llmCategoryBeforeRuleOverride?: string;
    llmExplanationBeforeRuleOverride?: string;
  };
  /**
   * Which email in the thread the rules were actually evaluated against. The
   * stored thread category is computed once (from whichever email triggered
   * priority processing), but the trace re-evaluates the currently-viewed
   * email. When that is not the latest reply, a later reply could flip a
   * NOT-contains exclusion, so the trace and the stored category can diverge.
   */
  evaluatedEmail: {
    emailId: string;
    isLatestInThread: boolean;
    evaluatedReceivedAt: string | null;
    latestReceivedAt: string | null;
    latestEmailId: string | null;
    threadEmailCount: number;
  };
}

@Injectable()
export class EmailDebugCategoryService {
  private readonly logger = new Logger(EmailDebugCategoryService.name);

  constructor(
    private dataSource: DataSource,
    private categoryRulesService: CategoryRulesService,
    private categoryShortlistService: CategoryShortlistService,
    private priorityAnalysisService: PriorityAnalysisService,
  ) {}

  private get emailRepository() {
    return this.dataSource.getRepository(Email);
  }

  private get emailThreadRepository() {
    return this.dataSource.getRepository(EmailThread);
  }

  private get userContextRepository() {
    return this.dataSource.getRepository(UserContext);
  }

  private get protoCategoryRepository() {
    return this.dataSource.getRepository(ProtoCategory);
  }

  /**
   * Lists every EMAIL_CATEGORY UserContext for a user with both the raw
   * `contextValue` and the parsed name/description, plus per-name grouping.
   *
   * Diagnoses ghost-empty categories caused by duplicate UserContext rows that
   * the server-side dedup misses — e.g. two rows for the same logical category
   * stored with different separators (`"Name - Description"` vs
   * `"Name: Description"`). `parseCategoryName` only splits on `" - "`, so the
   * `":"` variant parses to a different name and the rows aren't merged. The
   * inbox then renders both, often with one of them showing zero emails.
   *
   * `nameGroups` is sorted with `duplicateCount > 1` first so callers can scan
   * the response for collisions.
   */
  async listEmailCategoryContexts(userId: string): Promise<{
    totalContexts: number;
    contexts: Array<{
      contextId: string;
      rawContextValue: string;
      parsedName: string;
      parsedDescription: string | null;
      createdAt: Date;
    }>;
    nameGroups: Array<{
      parsedName: string;
      duplicateCount: number;
      contextIds: string[];
    }>;
  }> {
    const ctxs = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
        contextValue: true,
        createdAt: true,
      },
    });
    for (const ctx of ctxs) {
      decryptUserContextEntityForApi(ctx);
    }

    const contexts = ctxs
      .map((ctx) => {
        const { name, description } = parseCategoryValue(ctx.contextValue);
        return {
          contextId: ctx.contextId,
          rawContextValue: ctx.contextValue,
          parsedName: name,
          parsedDescription: description,
          createdAt: ctx.createdAt,
        };
      })
      .sort(
        (ctxA, ctxB) => ctxA.createdAt.getTime() - ctxB.createdAt.getTime(),
      );

    const byName = new Map<string, string[]>();
    for (const ctx of contexts) {
      const ids = byName.get(ctx.parsedName) ?? [];
      ids.push(ctx.contextId);
      byName.set(ctx.parsedName, ids);
    }
    const nameGroups = Array.from(byName.entries())
      .map(([parsedName, contextIds]) => ({
        parsedName,
        duplicateCount: contextIds.length,
        contextIds,
      }))
      .sort((groupA, groupB) => groupB.duplicateCount - groupA.duplicateCount);

    return {
      totalContexts: contexts.length,
      contexts,
      nameGroups,
    };
  }

  /** Assembles the thread-level section of the category debug payload. Extracted
   * so getCategoryDebugData stays within the complexity budget. */
  private buildThreadDebugSection(
    thread: EmailThread | null,
    categoryName: string | null,
  ): CategoryDebugData["thread"] {
    return {
      category: categoryName,
      categoryExplanation: thread?.categoryExplanation || null,
      categorySource: thread?.categorySource || null,
      shortlistedCategoryNames: thread?.shortlistedCategoryNames ?? null,
      categoryRuleTrace: thread?.categoryRuleTrace ?? null,
      localModelDebug: thread?.localModelDebug ?? null,
      categoryDecisionTrace: thread?.categoryDecisionTrace ?? null,
    };
  }

  async getCategoryDebugData(
    userId: string,
    emailId: string,
    options?: { deep?: boolean },
  ): Promise<CategoryDebugData> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    const thread = email.emailThreadId
      ? await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId },
        })
      : null;

    const [contexts, protoCategoryEntities] = await Promise.all([
      this.userContextRepository.find({ where: { userId } }),
      this.protoCategoryRepository.find({
        where: { userId, isPromoted: false },
        order: { emailCount: "DESC", createdAt: "DESC" },
      }),
    ]);

    const emailCategories = this.parseEmailCategories(contexts);
    const userContext = this.buildUserContext(contexts);
    const bodyPreview = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
    );

    const categoryName = resolveCategoryName(thread?.categoryId, contexts);

    const protoCategories = protoCategoryEntities.map((pc) => ({
      id: pc.id,
      name: pc.name,
      description: pc.description || undefined,
      categoryKey: protoCategoryKey(pc.id),
    }));

    const base: CategoryDebugData = {
      email: {
        emailId: email.id,
        from: email.from || "",
        fromName: email.fromName || "",
        senderJobTitle: email.senderJobTitle || "",
        subject: email.subject || "",
        bodyPreview,
        receivedAt: email.receivedAt ? email.receivedAt.toISOString() : null,
      },
      threadEmails: await this.buildThreadEmailsTimeline(userId, email),
      thread: this.buildThreadDebugSection(thread, categoryName),
      emailCategories,
      protoCategories,
      userContext,
    };

    if (!options?.deep) {
      return base;
    }

    const categorizationTrace = await this.buildCategorizationTrace(
      userId,
      email,
      emailCategories,
      protoCategories,
      userContext,
    );

    return { ...base, categorizationTrace };
  }

  private async buildCategorizationTrace(
    userId: string,
    email: Email,
    emailCategories: CategoryDebugData["emailCategories"],
    protoCategories: CategoryDebugData["protoCategories"],
    userContext: CategoryDebugData["userContext"],
  ): Promise<CategorizationTrace> {
    const allCombined = [...emailCategories, ...protoCategories];
    const cleanedForShortlist = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );
    // Deterministic rules match against (almost) the full message — plain text
    // AND the HTML part — mirroring the real categoriser, so body contains /
    // NOT-contains phrases deep in a long email or only in the HTML still apply.
    // The shortlist still uses the short classification preview.
    const bodyForRuleMatch = buildRuleMatchText(
      email.body || "",
      email.htmlBody,
      BODY_PREVIEW_LENGTHS.RULE_MATCH,
    );
    const meta = {
      from: email.from || "",
      subject: email.subject || "",
      bodyTextForMatch: bodyForRuleMatch,
    };
    const deterministicRules =
      await this.categoryRulesService.getDeterministicRulesDebug(userId, meta);
    const { winningRule } = deterministicRules;
    const bodyForPriorityLlm = winningRule
      ? `[Category pre-assigned by deterministic rule: "${winningRule.categoryName}". Focus on urgency and goal-alignment scoring only.]\n\n${email.body || ""}`
      : email.body || "";

    const shortlist = await this.buildDebugShortlistTrace(
      userId,
      email,
      allCombined,
      cleanedForShortlist,
    );
    const smartModel = await this.buildDebugSmartModelTrace({
      userId,
      email,
      bodyForPriorityLlm,
      winningRule,
      userContext,
      emailCategories,
      protoCategories,
    });

    const evaluatedEmail = await this.buildEvaluatedEmailMeta(userId, email);

    return { deterministicRules, shortlist, smartModel, evaluatedEmail };
  }

  /**
   * Lists every email in the debug target's thread (oldest first, capped) so
   * the UI can render a timeline with "viewing" / "latest" / "analysed at
   * decision time" markers. TypeORM `find` decrypts from/subject via the
   * column transformers.
   */
  private async buildThreadEmailsTimeline(
    userId: string,
    email: Email,
  ): Promise<CategoryDebugData["threadEmails"]> {
    const toEntry = (
      threadEmail: Email,
      isLatest: boolean,
    ): CategoryDebugData["threadEmails"][number] => ({
      emailId: threadEmail.id,
      from: threadEmail.from || "",
      fromName: threadEmail.fromName || "",
      subject: threadEmail.subject || "",
      receivedAt: threadEmail.receivedAt
        ? threadEmail.receivedAt.toISOString()
        : null,
      isDebugTarget: threadEmail.id === email.id,
      isLatest,
    });
    if (!email.emailThreadId) {
      return [toEntry(email, true)];
    }
    // Newest-first + reverse so a truncated long thread keeps its recent tail
    // and the last entry is genuinely the thread's latest email.
    const threadEmails = await this.emailRepository.find({
      where: { emailThreadId: email.emailThreadId, userId },
      order: { receivedAt: "DESC" },
      select: {
        id: true,
        from: true,
        fromName: true,
        subject: true,
        receivedAt: true,
      },
      take: THREAD_TIMELINE_LIMIT,
    });
    if (threadEmails.length === 0) {
      return [toEntry(email, true)];
    }
    return threadEmails
      .reverse()
      .map((threadEmail, index, list) =>
        toEntry(threadEmail, index === list.length - 1),
      );
  }

  /**
   * Determines whether the email the trace evaluated is the latest reply in its
   * thread. The stored thread category may have been computed from a different
   * (earlier) email, so surfacing this lets the UI warn when the trace and the
   * stored category could legitimately disagree.
   */
  private async buildEvaluatedEmailMeta(
    userId: string,
    email: Email,
  ): Promise<CategorizationTrace["evaluatedEmail"]> {
    const evaluatedReceivedAt = email.receivedAt
      ? email.receivedAt.toISOString()
      : null;

    if (!email.emailThreadId) {
      return {
        emailId: email.id,
        isLatestInThread: true,
        evaluatedReceivedAt,
        latestReceivedAt: evaluatedReceivedAt,
        latestEmailId: email.id,
        threadEmailCount: 1,
      };
    }

    const [latest, threadEmailCount] = await Promise.all([
      this.emailRepository.findOne({
        where: { emailThreadId: email.emailThreadId, userId },
        order: { receivedAt: "DESC" },
        select: {
          id: true,
          receivedAt: true,
        },
      }),
      this.emailRepository.count({
        where: { emailThreadId: email.emailThreadId, userId },
      }),
    ]);

    const evaluatedMs = email.receivedAt ? email.receivedAt.getTime() : null;
    const latestMs = latest?.receivedAt ? latest.receivedAt.getTime() : null;
    const isLatestInThread =
      !latest ||
      latest.id === email.id ||
      latestMs === null ||
      evaluatedMs === null ||
      evaluatedMs >= latestMs;

    return {
      emailId: email.id,
      isLatestInThread,
      evaluatedReceivedAt,
      latestReceivedAt: latest?.receivedAt
        ? latest.receivedAt.toISOString()
        : evaluatedReceivedAt,
      latestEmailId: latest?.id ?? email.id,
      threadEmailCount,
    };
  }

  private async buildDebugShortlistTrace(
    userId: string,
    email: Email,
    allCombined: Array<
      | CategoryDebugData["emailCategories"][number]
      | CategoryDebugData["protoCategories"][number]
    >,
    cleanedForShortlist: string,
  ): Promise<CategorizationTrace["shortlist"]> {
    if (!this.categoryShortlistService.isShortlistEnabled(allCombined.length)) {
      return {
        skipped: true,
        skipReason: `Category count (${allCombined.length}) is at or below the shortlist threshold; full list is passed to the smart model.`,
        categoryNames: allCombined.map((category) => category.name),
      };
    }
    try {
      const shortlisted = await this.categoryShortlistService.getShortlist(
        {
          from: email.from || "",
          fromName: email.fromName || undefined,
          subject: email.subject || "",
          summary: cleanedForShortlist,
        },
        allCombined,
      );
      return {
        skipped: false,
        categoryNames: shortlisted.map((category) => category.name),
      };
    } catch (err) {
      this.logger.warn(
        `Category debug shortlist failed for user ${userId}: ${(err as Error).message}`,
      );
      return {
        skipped: false,
        categoryNames: [],
        error: (err as Error).message,
      };
    }
  }

  private async buildDebugSmartModelTrace(options: {
    userId: string;
    email: Email;
    bodyForPriorityLlm: string;
    winningRule: CategorizationTrace["deterministicRules"]["winningRule"];
    userContext: CategoryDebugData["userContext"];
    emailCategories: CategoryDebugData["emailCategories"];
    protoCategories: CategoryDebugData["protoCategories"];
  }): Promise<CategorizationTrace["smartModel"]> {
    const {
      userId,
      email,
      bodyForPriorityLlm,
      winningRule,
      userContext,
      emailCategories,
      protoCategories,
    } = options;
    try {
      const priorityUserContext = {
        urgentItems: userContext.urgentItems,
        notUrgentItems: userContext.notUrgentItems,
        goals: userContext.goals,
        workingOn: userContext.workingOn,
        dontCare: userContext.dontCare,
        emailCategories,
        protoCategories,
      };
      const result = await this.priorityAnalysisService.analyzePriority({
        email: {
          from: email.from || "",
          fromName: email.fromName || undefined,
          senderJobTitle: email.senderJobTitle || undefined,
          subject: email.subject || "",
          body: bodyForPriorityLlm,
          receivedAt: email.receivedAt ?? undefined,
        },
        userId,
        userContext: priorityUserContext,
      });
      if (winningRule) {
        const kindOrType = winningRule.ruleType ?? winningRule.ruleKind;
        return {
          category: winningRule.categoryName,
          categoryExplanation: `Matched deterministic rule (${kindOrType}): category="${winningRule.categoryName}"`,
          llmCategoryBeforeRuleOverride: result.category,
          llmExplanationBeforeRuleOverride: result.categoryExplanation,
        };
      }
      return {
        category: result.category,
        categoryExplanation: result.categoryExplanation,
        categoryConfidence: result.categoryConfidence,
      };
    } catch (err) {
      this.logger.warn(
        `Category debug analyzePriority failed for user ${userId}: ${(err as Error).message}`,
      );
      return {
        category: "",
        categoryExplanation: "",
        error: (err as Error).message,
      };
    }
  }

  private parseEmailCategories(
    contexts: UserContext[],
  ): CategoryDebugData["emailCategories"] {
    return contexts
      .filter((category) => category.contextKey === ContextKey.EMAIL_CATEGORY)
      .map((category) => {
        const { name, description } = parseCategoryValue(category.contextValue);
        return {
          id: category.contextId,
          name,
          description: description ?? undefined,
          categoryKey: category.categoryKey ?? undefined,
        };
      });
  }

  private buildUserContext(contexts: UserContext[]): {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  } {
    return {
      urgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.URGENT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      notUrgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.NOT_IMPORTANT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      goals: contexts
        .filter((item) => item.contextKey === ContextKey.MY_GOALS)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      workingOn: contexts
        .filter((item) => item.contextKey === ContextKey.WORKING_ON)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      dontCare: contexts
        .filter((item) => item.contextKey === ContextKey.DONT_CARE)
        .map((item) => ({ value: item.contextValue })),
    };
  }
}
