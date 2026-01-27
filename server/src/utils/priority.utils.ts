/**
 * Utility functions for priority score calculations
 */

/**
 * Calculate priority score from breakdown array
 * This is the single source of truth for priority scores
 * @param priorityExplanation The priority explanation object with breakdown array
 * @returns The calculated score (can be negative), or 0 if no breakdown exists
 */
export function calculateScoreFromBreakdown(
  priorityExplanation: {
    breakdown?: Array<{ value: number }>;
    score?: number;
  } | null,
): number {
  if (!priorityExplanation || !priorityExplanation.breakdown) {
    return 0;
  }

  const total = priorityExplanation.breakdown.reduce(
    (sum, item) => sum + (item.value || 0),
    0,
  );

  // Clamp to 0-100 range for display purposes
  return Math.max(0, Math.min(100, total));
}
