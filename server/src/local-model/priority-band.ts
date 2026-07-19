import { PRIORITY_SCORES } from "../constants/priority-constants";

/** Priority band edges, mirroring the model's training config
 * (local-models/config.py PRIORITY_BAND_EDGES): low < LOW_MAX <= med < MED_MAX <= high. */
export const PRIORITY_BAND_LOW_MAX = 10;
export const PRIORITY_BAND_MED_MAX = 35;

/** Inclusive 0-100 score range the bands span, used to derive band midpoints. */
const PRIORITY_BAND_MIN = 0;
const PRIORITY_BAND_MAX = 100;

export type PriorityBand = "low" | "med" | "high";

/** Map a 0-100 priority score to its band, matching how the model was trained. */
export function priorityBand(score: number): PriorityBand {
  if (score < PRIORITY_BAND_LOW_MAX) return "low";
  if (score < PRIORITY_BAND_MED_MAX) return "med";
  return "high";
}

/**
 * Midpoint 0-100 priority score for each band, used when the local model
 * promotion path sets priorityScore without the LLM (the model only predicts a
 * band, not a score). Each value is the midpoint of its band's score range so
 * `priorityBand()` round-trips, e.g. med = (10 + 35) / 2 = 23.
 *
 * `high` is additionally clamped just below `PRIORITY_SCORES.HIGH_THRESHOLD`
 * (75) so a coarse band can never trigger emergency delivery (un-batching) —
 * breaking the batch is an LLM-only decision; the worst a band can do is sort
 * order. (At the current edges the midpoint is 68, already below the cap.)
 */
const BAND_MIDPOINT_SCORE: Record<PriorityBand, number> = {
  low: Math.round((PRIORITY_BAND_MIN + PRIORITY_BAND_LOW_MAX) / 2),
  med: Math.round((PRIORITY_BAND_LOW_MAX + PRIORITY_BAND_MED_MAX) / 2),
  high: Math.min(
    Math.round((PRIORITY_BAND_MED_MAX + PRIORITY_BAND_MAX) / 2),
    PRIORITY_SCORES.HIGH_THRESHOLD - 1,
  ),
};

/** Midpoint score to store for a predicted band (see {@link BAND_MIDPOINT_SCORE}). */
export function bandMidpointScore(band: PriorityBand | string): number {
  return BAND_MIDPOINT_SCORE[band as PriorityBand] ?? 0;
}
