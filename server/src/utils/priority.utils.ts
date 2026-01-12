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

  // Don't clamp - allow negative scores as breakdown can legitimately be negative
  // (e.g., low urgency = -12, low goal alignment = -5, etc.)
  return total;
}


