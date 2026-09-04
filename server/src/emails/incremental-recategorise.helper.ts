import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { categoriseWithEscalation } from "../llm/llm-categorise-summary";
import type { LLMCoreService } from "../llm/llm-core.service";
import { parseCategoryName } from "../utils/category-name.util";
import { persistLlmCategoryWithPrecedence } from "./category-column-updates.helper";
import {
  analyzedEmailFromEmail,
  buildCategoryDecisionTrace,
} from "./category-decision-trace.helper";
import { makeCategoryContextIdLookup } from "./category-lookup.helper";
import { LOCAL_CATEGORY_SOURCE } from "./category-precedence.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/** The "Other" sentinel the summary categoriser returns for category number 0. */
const OTHER_CATEGORY_NAME = "Other";

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

export interface RecategoriseFromSummaryDeps {
  categoryRulesService: CategoryRulesService;
  emailThreadRepository: Repository<EmailThread>;
  getThreadSummary: (emailThreadId: string) => Promise<string | null>;
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
 * summary exists (generating one if missing) before running the cheap
 * category-only {@link recategoriseFromSummary} — so a thread never sits in
 * "Other" waiting for a summary job that may never run.
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
 * ask the LLM to pick a category from the updated thread summary. Writes through
 * the precedence guard with a decision trace tagged `writtenBy: "incremental"`.
 * Best-effort: any failure leaves the existing category untouched. A thread that
 * already carries a real category is never demoted to "Other"; but a thread the
 * local model parked in provisional "Other" IS settled as a definitive
 * AI-decided "Other" when no real category resolves, so it never stays stuck
 * "awaiting re-categorisation" (see {@link settleLocalModelOther}).
 */
export async function recategoriseFromSummary(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
): Promise<void> {
  const { email, userId, workerId } = args;
  const { emailThreadId } = email;
  if (!emailThreadId) return;
  const decidedAt = new Date().toISOString();

  // 1. Deterministic category rules on the new email (no LLM).
  const meta = buildRuleEmailMetadata(email);
  const { match, snapshot } =
    await deps.categoryRulesService.peekMatchingRuleWithTrace(userId, meta);
  if (match?.categoryId) {
    await persistLlmCategoryWithPrecedence(
      deps.emailThreadRepository,
      deps.logger,
      {
        emailThreadId,
        workerId,
        ruleCategoryId: match.categoryId,
        categoryRuleTrace: snapshot,
        categoryId: match.categoryId,
        finalCategory: match.categoryName,
        protoCategoryId: null,
        resolvedCategoryExplanation: `Incremental re-categorisation: deterministic rule matched "${match.categoryName}".`,
        decisionTrace: buildCategoryDecisionTrace({
          decidedAt,
          source: "rule",
          writtenBy: "incremental",
          trigger: "new-email",
          analyzedEmail: analyzedEmailFromEmail(email, "email-metadata"),
          finalCategory: match.categoryName,
          finalCategoryId: match.categoryId,
          steps: [
            {
              step: "deterministic-rule",
              outcome: "applied",
              category: match.categoryName,
              categoryId: match.categoryId,
              detail:
                "Deterministic rule matched the new email during incremental re-categorisation.",
            },
          ],
        }),
      },
    );
    return;
  }

  // 2. Summary-based LLM categorisation (category-only, not the full flow).
  await recategoriseViaSummaryLlm(deps, args, emailThreadId, decidedAt);
}

async function recategoriseViaSummaryLlm(
  deps: RecategoriseFromSummaryDeps,
  args: RecategoriseFromSummaryArgs,
  emailThreadId: string,
  decidedAt: string,
): Promise<void> {
  // The summary is refreshed to include the latest message BEFORE this runs (see
  // LLMSummaryProcessorService.ensureThreadSummaryFresh in the priority
  // pipeline), so categorising off it reflects the newest message — including a
  // status/verdict flip that would change the category — without any
  // message-type special-casing.
  //
  // A thread the local model parked in provisional "Other" (categorySource
  // 'local', categoryId null) must be SETTLED by this LLM pass rather than left
  // "awaiting re-categorisation" forever — even when the pass can't resolve a
  // real category. A thread that already has a real category (the incremental
  // path) is only ever moved to a DIFFERENT real category; an "Other"/unresolved
  // verdict leaves it untouched (never demote a real category to "Other").
  const { thread, email, userId, userContexts } = args;
  const isLocalModelProvisionalOther =
    threadNeedsLocalModelRecategorisation(thread);
  const summary = await deps.getThreadSummary(emailThreadId);
  if (!summary) return;
  const categories = userContexts
    .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
    .map((ctx) => ({ name: parseCategoryName(ctx.contextValue) }))
    .filter((cat) => cat.name);
  // No user categories at all: the thread can only be "Other". Still settle a
  // local-model provisional Other so it leaves the "awaiting" limbo.
  if (categories.length === 0) {
    if (isLocalModelProvisionalOther) {
      await settleLocalModelOther(deps, args, emailThreadId, decidedAt, null);
    }
    return;
  }

  const result = await categoriseWithEscalation(
    deps.llmCoreService,
    deps.logger,
    {
      subject: email.subject || "",
      senderName: email.fromName,
      summary,
      categories,
      userId,
    },
  );

  const resolvedCategoryId =
    result && result.categoryName !== OTHER_CATEGORY_NAME
      ? makeCategoryContextIdLookup(userContexts)(result.categoryName)
      : null;

  // A real category resolved (and it's a change): apply it. Rescue path shared
  // by both callers.
  if (resolvedCategoryId && resolvedCategoryId !== thread.categoryId) {
    await applyRealSummaryCategory(deps, args, emailThreadId, decidedAt, {
      categoryId: resolvedCategoryId,
      categoryName: result!.categoryName,
      reasoning: result!.reasoning,
    });
    return;
  }

  // No real category. Never demote a thread that already carries one; but settle
  // a local-model provisional "Other" as a definitive AI-decided "Other" so it
  // stops advertising "awaiting re-categorisation" and matches the non-local LLM
  // flow (categorySource cleared, thread freely re-categorisable / proto-eligible).
  if (isLocalModelProvisionalOther) {
    await settleLocalModelOther(
      deps,
      args,
      emailThreadId,
      decidedAt,
      result?.reasoning ?? null,
    );
  }
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
      resolvedCategoryExplanation:
        resolved.reasoning ??
        "Incremental re-categorisation from the updated thread summary.",
      decisionTrace: buildCategoryDecisionTrace({
        decidedAt,
        source: "priority",
        writtenBy: "incremental",
        trigger: "new-email",
        analyzedEmail: analyzedEmailFromEmail(email, "thread-summary"),
        finalCategory: resolved.categoryName,
        finalCategoryId: resolved.categoryId,
        steps: [
          {
            step: "llm",
            outcome: "applied",
            category: resolved.categoryName,
            categoryId: resolved.categoryId,
            detail:
              resolved.reasoning ??
              "Re-categorised from the updated thread summary (incremental).",
          },
        ],
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Incremental re-categorisation: thread ${emailThreadId} → "${resolved.categoryName}" (from summary)`,
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
      decisionTrace: buildCategoryDecisionTrace({
        decidedAt,
        source: "priority",
        writtenBy: "incremental",
        trigger: "new-email",
        analyzedEmail: analyzedEmailFromEmail(email, "thread-summary"),
        finalCategory: OTHER_CATEGORY_NAME,
        finalCategoryId: null,
        steps: [
          {
            step: "llm",
            outcome: "applied",
            category: OTHER_CATEGORY_NAME,
            categoryId: null,
            detail: explanation,
          },
        ],
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Local-model "Other" settled via summary re-categorisation: thread ${emailThreadId} (no user category matched)`,
  );
}
