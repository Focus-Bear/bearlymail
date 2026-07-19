import { buildCategoryDecisionTrace } from "../emails/category-decision-trace.helper";
import type { CategoryDecisionTrace } from "../emails/category-decision-trace.types";

/**
 * Builds the decision-trace stamped onto every thread a proto-category promotion/fold
 * bulk-reassigns. Without it the bulk `UPDATE` left `categorySource` stale (e.g. "priority")
 * and wrote no trace, so the debug UI kept showing the per-thread priority pick while the
 * stored category was the promoted bucket — the "decision doesn't match the debug" symptom.
 */
export function buildProtoPromotionTrace(
  categoryName: string,
  categoryId: string,
  detail: string,
  decidedAt: Date,
): CategoryDecisionTrace {
  return buildCategoryDecisionTrace({
    decidedAt: decidedAt.toISOString(),
    source: null,
    writtenBy: "proto-promotion",
    trigger: "proto-promotion",
    finalCategory: categoryName,
    finalCategoryId: categoryId,
    steps: [
      {
        step: "proto-promotion",
        outcome: "applied",
        category: categoryName,
        categoryId,
        detail,
      },
    ],
  });
}
