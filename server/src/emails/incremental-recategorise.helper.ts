import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import type { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { ProtoCategory } from "../database/entities/proto-category.entity";
import type { UserContext } from "../database/entities/user-context.entity";
import { OTHER_CATEGORY_NAME } from "../llm/llm-categorise-summary";
import type { LLMCoreService } from "../llm/llm-core.service";
import type { PriorityCategoryStepDeps } from "../llm/priority-category-step";
import { resolveCategoryName } from "../utils/category-name.util";
import {
  persistCategoryDecisionTraceOnly,
  persistLlmCategoryWithPrecedence,
} from "./category-column-updates.helper";
import type { CategoryDecisionStep } from "./category-decision-trace.types";
import {
  categorySourceRank,
  LOCAL_CATEGORY_SOURCE,
  PRIORITY_CATEGORY_SOURCE,
} from "./category-precedence.helper";
import {
  buildIncrementalCategoryCandidates,
  chooseIncrementalCategory,
  INCREMENTAL_VERDICT_KIND,
  type IncrementalCategoryVerdict,
} from "./incremental-category-choice.helper";
import {
  incrementalLlmTrace,
  incrementalRuleTrace,
  keptLlmStep,
  unchangedLlmStep,
} from "./incremental-recategorise-trace.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/**
 * True when the local model applied priority but left the thread without a real
 * category (`categorySource === "local"` and `categoryId == null`) — whether the
 * category head was UNCONFIDENT (`categoryFallback`) or CONFIDENT but resolved to
 * no user category. Both cases defer to the cheap summary-based classification
 * rather than parking in "Other"; a confident local "Other" no longer dead-ends
 * there. A resolved category or a user/rule/LLM-pinned category returns false
 * (categoryId is set, or the source is no longer "local"), so a fresh summary
 * never re-runs the LLM on a settled thread.
 */
export function threadNeedsLocalModelRecategorisation(
  thread?: {
    categorySource: string | null;
    categoryId: string | null;
  } | null,
): boolean {
  return (
    thread?.categorySource === LOCAL_CATEGORY_SOURCE &&
    thread?.categoryId == null
  );
}

/**
 * True when the stored category outranks anything this automated writer could
 * persist (user-pinned or rule-decided): the LLM verdict would be blocked by
 * the precedence guard, so the call is skipped rather than wasted.
 */
function isCategoryPinnedAboveAutomation(thread: {
  categorySource: string | null;
}): boolean {
  return (
    categorySourceRank(thread.categorySource) >
    categorySourceRank(PRIORITY_CATEGORY_SOURCE)
  );
}

export interface RecategoriseFromSummaryDeps {
  categoryRulesService: CategoryRulesService;
  categoryShortlistService: PriorityCategoryStepDeps["categoryShortlistService"];
  emailThreadRepository: Repository<EmailThread>;
  getThreadSummary: (emailThreadId: string) => Promise<string | null>;
  getProtoCategories: (userId: string) => Promise<ProtoCategory[]>;
  llmCoreService: LLMCoreService;
  logger: Logger;
}

export interface RecategoriseFromSummaryArgs {
  thread: EmailThread;
  email: Email;
  userId: string;
  workerId: string;
  userContexts: UserContext[];
}

export interface EscalateLocalModelCategoryDeps extends RecategoriseFromSummaryDeps {
  getEmail: (userId: string, emailId: string) => Promise<Email | null>;
  getUserContexts: (userId: string) => Promise<UserContext[]>;
  ensureThreadSummaryFresh: (
    email: Email,
    userId: string,
    workerId: string,
  ) => Promise<void>;
}

/**
 * Immediate LLM category escalation for a thread the local model applied
 * priority to but ABSTAINED on category (categorySource 'local', categoryId
 * null). Unlike the deferred summary-completion trigger, this ENSURES a thread
 * summary exists (generating one if missing) before running the category-only
 * {@link recategoriseFromSummary} — so a thread never sits in "Other" waiting
 * for a summary job that may never run.
 *
 * Idempotent + anti-loop: a no-op once the thread carries a settled category
 * (`!threadNeedsLocalModelRecategorisation` — a rule/user/LLM already decided,
 * or `recategoriseFromSummary`/`settleLocalModelOther` already cleared the
 * 'local'+null state). It never re-enqueues itself, so a still-unresolved
 * thread is simply left settled. Must run inside the caller's `withUserKey`
 * scope (reads/writes encrypted email + summary columns).
 */
export async function escalateLocalModelCategory(
  deps: EscalateLocalModelCategoryDeps,
  args: {
    userId: string;
    emailThreadId: string;
    emailId: string;
    workerId: string;
  },
): Promise<void> {
  const { userId, emailThreadId, emailId, workerId } = args;
  const thread = await deps.emailThreadRepository.findOne({
    where: { id: emailThreadId },
  });
  if (!thread || !threadNeedsLocalModelRecategorisation(thread)) {
    return;
  }
  const email = await deps.getEmail(userId, emailId);
  if (!email) {
    deps.logger.warn(
      `[Worker ${workerId}] escalate-category: email ${emailId} not found for thread ${emailThreadId} — skipping`,
    );
    return;
  }
  // The deferred path bails when no summary exists; generate one now so the
  // category-only LLM has thread content to classify.
  await deps.ensureThreadSummaryFresh(email, userId, workerId);
  const userContexts = await deps.getUserContexts(userId);
  await recategoriseFromSummary(deps, {
    thread,
    email,
    userId,
    workerId,
    userContexts,
  });
}

/**
 * Incremental, category-ONLY re-categorisation after a new email is summarised:
 * try the deterministic category rules on the new email first (no LLM), else
 * run the SAME categoriser as the new-email priority path (category
 * descriptions, proto categories, embedding shortlist, Nova→Gemini escalation)
 * on the refreshed thread summary PLUS the new email's own cleaned body.
 *
 * Every evaluation leaves a decision trace stamped with the NEW email
 * (`writtenBy: "incremental"`): a changed category is written through the
 * precedence guard; an unchanged verdict, or an "Other"/unresolved/failed one
 * on a thread that already has a category, writes a trace-only record so the
 * debug panel shows that the latest message WAS re-evaluated. A thread that
 * already carries a real category is never demoted to "Other"; but a thread
 * the local model parked in provisional "Other" IS settled as a definitive
 * AI-decided "Other" when no real category resolves, so it never stays stuck
 * "awaiting re-categorisation" (see {@link settleLocalModelOther}).
 */
export async function recategoriseFromSummary(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
): Promise<void> {
  const { email, userId } = args;
  const { emailThreadId } = email;
  if (!emailThreadId) return;
  const decidedAt = new Date().toISOString();

  // 1. Deterministic category rules on the new email (no LLM).
  const meta = buildRuleEmailMetadata(email);
  const { match, snapshot } =
    await deps.categoryRulesService.peekMatchingRuleWithTrace(userId, meta);
  if (match?.categoryId) {
    await applyRuleCategory(deps, args, emailThreadId, decidedAt, {
      categoryId: match.categoryId,
      categoryName: match.categoryName,
      snapshot,
    });
    return;
  }

  // 2. Main-path LLM categorisation (category-only, not the full priority flow).
  await recategoriseViaLlm(deps, args, emailThreadId, decidedAt);
}

async function applyRuleCategory(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
  rule: {
    categoryId: string;
    categoryName: string;
    snapshot: CategoryRuleTraceSnapshot | null | undefined;
  },
): Promise<void> {
  const { email, workerId } = args;
  await persistLlmCategoryWithPrecedence(
    deps.emailThreadRepository,
    deps.logger,
    {
      emailThreadId,
      workerId,
      ruleCategoryId: rule.categoryId,
      categoryRuleTrace: rule.snapshot,
      categoryId: rule.categoryId,
      finalCategory: rule.categoryName,
      protoCategoryId: null,
      resolvedCategoryExplanation: `Incremental re-categorisation: deterministic rule matched "${rule.categoryName}".`,
      decisionTrace: incrementalRuleTrace({
        decidedAt,
        email,
        categoryName: rule.categoryName,
        categoryId: rule.categoryId,
      }),
    },
  );
}

async function recategoriseViaLlm(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
): Promise<void> {
  // The summary is refreshed to include the latest message BEFORE this runs (see
  // LLMSummaryProcessorService.ensureThreadSummaryFresh in the priority
  // pipeline); the new email's own body is shown alongside it so a short but
  // decisive message (a QA verdict, a status flip) is not diluted away.
  const { thread, email, userId, workerId, userContexts } = args;
  if (isCategoryPinnedAboveAutomation(thread)) {
    deps.logger.log(
      `[Worker ${workerId}] Incremental re-categorisation skipped for thread ${emailThreadId}: categorySource "${thread.categorySource}" outranks automated writes`,
    );
    return;
  }
  const summary = await deps.getThreadSummary(emailThreadId);
  if (!summary) return;
  const candidates = buildIncrementalCategoryCandidates(
    userContexts,
    await deps.getProtoCategories(userId),
  );
  // No user categories at all: the thread can only be "Other". Still settle a
  // local-model provisional Other so it leaves the "awaiting" limbo.
  if (candidates.emailCategories.length === 0) {
    if (threadNeedsLocalModelRecategorisation(thread)) {
      await settleLocalModelOther(deps, args, emailThreadId, decidedAt, null);
    }
    return;
  }

  const verdict = await chooseIncrementalCategory(
    {
      llmCoreService: deps.llmCoreService,
      categoryShortlistService: deps.categoryShortlistService,
      logger: deps.logger,
    },
    { email, summary, userContexts, candidates, userId },
  );
  await applyIncrementalVerdict(deps, args, emailThreadId, decidedAt, verdict);
}

/**
 * Persists the categoriser's verdict: a DIFFERENT real category is applied; the
 * SAME category records an "unchanged" trace; no real category settles a
 * local-model provisional "Other" or, on a thread that already has a category,
 * records a "kept" trace (never demote to Other).
 */
async function applyIncrementalVerdict(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
  verdict: IncrementalCategoryVerdict,
): Promise<void> {
  const { thread } = args;
  if (verdict.kind === INCREMENTAL_VERDICT_KIND.CATEGORY) {
    if (verdict.categoryId !== thread.categoryId) {
      await applyRealSummaryCategory(
        deps,
        args,
        emailThreadId,
        decidedAt,
        verdict,
      );
      return;
    }
    await persistTraceOnlyOutcome(deps, args, emailThreadId, {
      decidedAt,
      step: unchangedLlmStep(verdict),
    });
    return;
  }
  if (threadNeedsLocalModelRecategorisation(thread)) {
    await settleLocalModelOther(
      deps,
      args,
      emailThreadId,
      decidedAt,
      verdict.kind === INCREMENTAL_VERDICT_KIND.UNAVAILABLE
        ? null
        : verdict.reasoning,
    );
    return;
  }
  await persistTraceOnlyOutcome(deps, args, emailThreadId, {
    decidedAt,
    step: keptLlmStep(verdict, currentCategoryName(args)),
  });
}

function currentCategoryName(args: RecategoriseFromSummaryArgs): string {
  return (
    resolveCategoryName(args.thread.categoryId, args.userContexts) ??
    OTHER_CATEGORY_NAME
  );
}

/** Trace-only write: the category stays as it is, but the re-evaluation is recorded. */
async function persistTraceOnlyOutcome(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  outcome: { decidedAt: string; step: CategoryDecisionStep },
): Promise<void> {
  const { thread, email, workerId } = args;
  const finalCategory = currentCategoryName(args);
  await persistCategoryDecisionTraceOnly(
    deps.emailThreadRepository,
    deps.logger,
    {
      emailThreadId,
      workerId,
      decisionTrace: incrementalLlmTrace({
        decidedAt: outcome.decidedAt,
        email,
        finalCategory,
        finalCategoryId: thread.categoryId ?? null,
        step: outcome.step,
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Incremental re-categorisation: thread ${emailThreadId} stays "${finalCategory}" (${outcome.step.outcome}: ${outcome.step.detail})`,
  );
}

async function applyRealSummaryCategory(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
  resolved: {
    categoryId: string;
    categoryName: string;
    reasoning: string | null;
  },
): Promise<void> {
  const { email, workerId } = args;
  const explanation =
    resolved.reasoning ??
    "Incremental re-categorisation from the updated thread summary and the new message.";
  await persistLlmCategoryWithPrecedence(
    deps.emailThreadRepository,
    deps.logger,
    {
      emailThreadId,
      workerId,
      ruleCategoryId: null,
      categoryRuleTrace: undefined,
      categoryId: resolved.categoryId,
      finalCategory: resolved.categoryName,
      protoCategoryId: null,
      resolvedCategoryExplanation: explanation,
      decisionTrace: incrementalLlmTrace({
        decidedAt,
        email,
        finalCategory: resolved.categoryName,
        finalCategoryId: resolved.categoryId,
        step: {
          step: "llm",
          outcome: "applied",
          category: resolved.categoryName,
          categoryId: resolved.categoryId,
          detail: explanation,
        },
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Incremental re-categorisation: thread ${emailThreadId} → "${resolved.categoryName}" (from summary + new message)`,
  );
}

/**
 * Settle a local-model provisional "Other" thread as a definitive AI-decided
 * "Other". Writes categoryId null + finalCategory "Other" through the precedence
 * guard, which clears `categorySource` (the non-local LLM "Other" convention):
 * afterwards {@link threadNeedsLocalModelRecategorisation} is false, so the
 * thread no longer loops back into deferred re-categorisation and no longer
 * shows "awaiting re-categorisation from the thread summary". The thread stays
 * `categoryId IS NULL`, so proto-category generation and a future full LLM
 * refine can still move it out of "Other".
 */
async function settleLocalModelOther(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
  reasoning: string | null,
): Promise<void> {
  const { email, workerId } = args;
  const explanation =
    reasoning ??
    'Re-categorised from the thread summary: no matching user category — settled as "Other".';
  await persistLlmCategoryWithPrecedence(
    deps.emailThreadRepository,
    deps.logger,
    {
      emailThreadId,
      workerId,
      ruleCategoryId: null,
      categoryRuleTrace: undefined,
      categoryId: null,
      finalCategory: OTHER_CATEGORY_NAME,
      protoCategoryId: null,
      resolvedCategoryExplanation: explanation,
      decisionTrace: incrementalLlmTrace({
        decidedAt,
        email,
        finalCategory: OTHER_CATEGORY_NAME,
        finalCategoryId: null,
        step: {
          step: "llm",
          outcome: "applied",
          category: OTHER_CATEGORY_NAME,
          categoryId: null,
          detail: explanation,
        },
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Local-model "Other" settled via summary re-categorisation: thread ${emailThreadId} (no user category matched)`,
  );
}
