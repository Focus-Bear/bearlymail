import type { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Whether a thread's stored priority state is rich enough to reuse via the cheap
 * incremental analysis path (skipping a full recalc). Requires a real scored
 * breakdown (not the legacy structure, not a mid-flight "Calculating..."
 * placeholder), an already-resolved category, and a numeric score. Pure — reads
 * only the passed thread.
 */
export function canUseIncrementalAnalysis(thread: EmailThread): boolean {
  const threadPriorityExplanation = thread.priorityExplanation;
  const existingBreakdown = threadPriorityExplanation?.breakdown || [];
  const hasValidBreakdown =
    existingBreakdown.length > 0 &&
    existingBreakdown.some(
      (item) => item.value !== 0 && item.value !== undefined,
    );
  const hasOldStructure =
    threadPriorityExplanation?.breakdown?.some(
      (item) =>
        item.factor === "Base Score" ||
        item.factor === "🤖 AI Analysis" ||
        item.factor === "AI Analysis",
    ) ?? false;
  const hasCalculatingItems = existingBreakdown.some(
    (item) =>
      item.description === "Calculating..." ||
      item.description?.includes("Calculating..."),
  );
  return (
    hasValidBreakdown &&
    !hasOldStructure &&
    !hasCalculatingItems &&
    thread.categoryId !== null &&
    threadPriorityExplanation?.score !== undefined
  );
}
