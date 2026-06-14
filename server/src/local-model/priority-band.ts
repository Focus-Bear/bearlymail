/** Priority band edges, mirroring the model's training config
 * (local-models/config.py PRIORITY_BAND_EDGES): low < LOW_MAX <= med < MED_MAX <= high. */
export const PRIORITY_BAND_LOW_MAX = 10;
export const PRIORITY_BAND_MED_MAX = 35;

export type PriorityBand = "low" | "med" | "high";

/** Map a 0-100 priority score to its band, matching how the model was trained. */
export function priorityBand(score: number): PriorityBand {
  if (score < PRIORITY_BAND_LOW_MAX) return "low";
  if (score < PRIORITY_BAND_MED_MAX) return "med";
  return "high";
}
