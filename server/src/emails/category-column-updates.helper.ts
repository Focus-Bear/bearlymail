import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Builds the conditional category columns for a thread update during priority
 * persistence. Kept as a pure helper so the conditional spreads don't push
 * `persistPriorityToThread` over the complexity/line budgets.
 *
 * - `categoryId`: written whenever resolved (including `null`, so re-categorising
 *   a thread as "Other" clears the previous UUID). Only `undefined` leaves the
 *   column untouched.
 * - `categorySource`: set to `"priority"` when the priority step picked a real
 *   category, otherwise cleared to `null` so we don't leave a stale source.
 * - `categoryRuleTrace`: only written when a snapshot was computed (the
 *   single-email refiner); `undefined` leaves the column untouched so the batch
 *   path can't clobber a previously-captured snapshot with null.
 */
export function buildCategoryColumnUpdates(
  categoryId: string | null,
  finalCategory: string | null,
  categoryRuleTrace: CategoryRuleTraceSnapshot | null | undefined,
): Partial<EmailThread> {
  return {
    ...(categoryId !== undefined ? { categoryId } : {}),
    categorySource:
      finalCategory && finalCategory !== "Other" ? ("priority" as const) : null,
    ...(categoryRuleTrace !== undefined ? { categoryRuleTrace } : {}),
  };
}
