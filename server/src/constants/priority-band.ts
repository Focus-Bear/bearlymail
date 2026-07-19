import { PRIORITY_SCORES } from "./priority-constants";

/**
 * Coarse priority bands assigned by deterministic priority rules. Bands replace
 * the LLM's exact 0-100 score because a learned rule cannot reproduce that
 * number reliably — but it CAN reproduce the band an email's score falls into
 * (issue: deterministic priority rules). Each band maps to a single
 * representative score that gets written to `EmailThread.priorityScore` so the
 * inbox keeps sorting normally.
 *
 * Band cut-offs reuse the existing `PRIORITY_SCORES` thresholds so a rule-band
 * score sorts into the same neighbourhood the LLM would have placed it.
 */
export type PriorityBand = "urgent" | "high" | "medium" | "low" | "very_low";

export const PRIORITY_BANDS: readonly PriorityBand[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "very_low",
] as const;

/** Representative score written when a rule assigns each band. */
export const PRIORITY_BAND_REPRESENTATIVE_SCORE: Record<PriorityBand, number> =
  {
    urgent: 95,
    high: 80,
    medium: 50,
    low: 35,
    very_low: 15,
  };

/**
 * Maps an LLM priority score (0-100) to its band. Cut-offs are inclusive of the
 * lower bound and aligned to `PRIORITY_SCORES`:
 *   urgent ≥ 90, high 75-89, medium 50-74, low 25-49, very_low < 25.
 */
export function scoreToBand(score: number): PriorityBand {
  if (score >= PRIORITY_SCORES.URGENT_THRESHOLD) return "urgent";
  if (score >= PRIORITY_SCORES.HIGH_THRESHOLD) return "high";
  if (score >= PRIORITY_SCORES.MEDIUM_THRESHOLD) return "medium";
  if (score >= PRIORITY_SCORES.LOW_THRESHOLD) return "low";
  return "very_low";
}

/** The representative score a rule writes for a given band. */
export function bandToRepresentativeScore(band: PriorityBand): number {
  return PRIORITY_BAND_REPRESENTATIVE_SCORE[band];
}
