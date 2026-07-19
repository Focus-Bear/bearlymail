import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { CategoryDecisionTrace } from "./category-decision-trace.types";
import { updateThreadCategoryWithPrecedence } from "./category-precedence.helper";

/**
 * Builds the conditional category columns for a thread update during priority
 * persistence. Kept as a pure helper so the conditional spreads don't push
 * `persistPriorityToThread` over the complexity/line budgets.
 *
 * - `categoryId`: written whenever resolved (including `null`, so re-categorising
 *   a thread as "Other" clears the previous UUID). Only `undefined` leaves the
 *   column untouched.
 * - `categorySource`: set to the writer's source (`"rule"` when a matched
 *   category rule supplied the category, else `"priority"`) when a real
 *   category was picked, otherwise cleared to `null` so we don't leave a stale
 *   source. The stored value is what the precedence guard ranks on later.
 * - `categoryRuleTrace`: only written when a snapshot was computed (the
 *   single-email refiner); `undefined` leaves the column untouched so the batch
 *   path can't clobber a previously-captured snapshot with null.
 */
export function buildCategoryColumnUpdates(
  categoryId: string | null,
  finalCategory: string | null,
  categoryRuleTrace: CategoryRuleTraceSnapshot | null | undefined,
  writerSource: "rule" | "priority" = "priority",
): Partial<EmailThread> {
  return {
    ...(categoryId !== undefined ? { categoryId } : {}),
    categorySource:
      finalCategory && finalCategory !== "Other" ? writerSource : null,
    ...(categoryRuleTrace !== undefined ? { categoryRuleTrace } : {}),
  };
}

/**
 * Writes the LLM priority path's category columns through the precedence
 * guard, in a separate update from the priority columns: a category the user
 * pinned (or a rule decided, when this run's category came from the LLM alone)
 * must not be moved by a later automated re-run — but the priority result
 * still applies. Writes as source 'rule' when the matched rule's authoritative
 * categoryId won the resolution, else 'priority'.
 */
export async function persistLlmCategoryWithPrecedence(
  repository: Repository<EmailThread>,
  logger: Logger,
  args: {
    emailThreadId: string;
    workerId: string;
    ruleCategoryId: string | null;
    categoryRuleTrace: CategoryRuleTraceSnapshot | null | undefined;
    categoryId: string | null;
    finalCategory: string | null;
    protoCategoryId: string | null;
    resolvedCategoryExplanation: string | null;
    decisionTrace: CategoryDecisionTrace;
  },
): Promise<void> {
  const { emailThreadId, workerId, categoryId } = args;
  const writerSource: "rule" | "priority" =
    args.ruleCategoryId != null && categoryId === args.ruleCategoryId
      ? "rule"
      : "priority";
  const applied = await updateThreadCategoryWithPrecedence(repository, {
    where: { id: emailThreadId },
    source: writerSource,
    set: {
      categoryExplanation: args.resolvedCategoryExplanation,
      protoCategoryId: args.protoCategoryId,
      categoryDecisionTrace: args.decisionTrace,
      ...buildCategoryColumnUpdates(
        categoryId,
        args.finalCategory,
        args.categoryRuleTrace,
        writerSource,
      ),
    },
  });
  if (applied === 0) {
    logger.log(
      `[Worker ${workerId}] Category write blocked by precedence for thread ${emailThreadId} (source=${writerSource} cannot override the stored categorySource) — priority updated, category kept`,
    );
  }
}
