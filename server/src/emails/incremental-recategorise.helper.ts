import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { categoriseFromSummary } from "../llm/llm-categorise-summary";
import type { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_CATEGORISE_SUMMARY } from "../llm/llm-operations";
import { parseCategoryName } from "../utils/category-name.util";
import { persistLlmCategoryWithPrecedence } from "./category-column-updates.helper";
import {
  analyzedEmailFromEmail,
  buildCategoryDecisionTrace,
} from "./category-decision-trace.helper";
import { makeCategoryContextIdLookup } from "./category-lookup.helper";
import { LOCAL_CATEGORY_SOURCE } from "./category-precedence.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/**
 * True when a thread is one the local model deliberately left in "Other"
 * because its category head was UNCONFIDENT (`localModelDebug.categoryFallback`)
 * — i.e. priority was applied locally but the category still needs the cheap
 * summary-based classification. A confident "Other", a resolved category, or a
 * user/rule-pinned category all return false (the categorySource is no longer
 * "local", or the flag is unset), so a fresh summary never re-runs the LLM on a
 * settled thread.
 */
export function threadNeedsLocalModelRecategorisation(thread: {
  categorySource: string | null;
  categoryId: string | null;
  localModelDebug?: { categoryFallback?: boolean } | null;
}): boolean {
  return (
    thread.categorySource === LOCAL_CATEGORY_SOURCE &&
    thread.categoryId == null &&
    !!thread.localModelDebug?.categoryFallback
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

/**
 * Incremental, category-ONLY re-categorisation after a new email is summarised:
 * try the deterministic category rules on the new email first (no LLM), else
 * ask the LLM to pick a category from the updated thread summary. Writes through
 * the precedence guard with a decision trace tagged `writtenBy: "incremental"`.
 * Best-effort: any failure leaves the existing category untouched (never
 * clobbers a real category with "Other").
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
  const { thread, email, userId, workerId, userContexts } = args;
  const summary = await deps.getThreadSummary(emailThreadId);
  if (!summary) return;
  const categories = userContexts
    .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
    .map((ctx) => ({ name: parseCategoryName(ctx.contextValue) }))
    .filter((cat) => cat.name);
  if (categories.length === 0) return;

  const result = await categoriseFromSummary(
    (request) =>
      deps.llmCoreService.generateText(
        { ...request, operation: LLM_OP_CATEGORISE_SUMMARY },
        undefined,
        userId,
      ),
    deps.logger,
    {
      subject: email.subject || "",
      senderName: email.fromName,
      summary,
      categories,
      userId,
    },
  );
  // Don't clobber a real category with "Other" or an unresolved name.
  if (!result || result.categoryName === "Other") return;
  const categoryId = makeCategoryContextIdLookup(userContexts)(
    result.categoryName,
  );
  if (!categoryId || categoryId === thread.categoryId) return;

  await persistLlmCategoryWithPrecedence(
    deps.emailThreadRepository,
    deps.logger,
    {
      emailThreadId,
      workerId,
      ruleCategoryId: null,
      categoryRuleTrace: undefined,
      categoryId,
      finalCategory: result.categoryName,
      protoCategoryId: null,
      resolvedCategoryExplanation:
        result.reasoning ??
        "Incremental re-categorisation from the updated thread summary.",
      decisionTrace: buildCategoryDecisionTrace({
        decidedAt,
        source: "priority",
        writtenBy: "incremental",
        trigger: "new-email",
        analyzedEmail: analyzedEmailFromEmail(email, "thread-summary"),
        finalCategory: result.categoryName,
        finalCategoryId: categoryId,
        steps: [
          {
            step: "llm",
            outcome: "applied",
            category: result.categoryName,
            categoryId,
            detail:
              result.reasoning ??
              "Re-categorised from the updated thread summary (incremental).",
          },
        ],
      }),
    },
  );
  deps.logger.log(
    `[Worker ${workerId}] Incremental re-categorisation: thread ${emailThreadId} → "${result.categoryName}" (from summary)`,
  );
}
