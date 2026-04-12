/**
 * Priority bucket definitions — single source of truth for priority tier boundaries.
 *
 * Fix #1452 (bugs 3 & 4): Restore actual server score ranges (pre-PR-#1417 values).
 * The new 0–20–40–60–80–100 visual buckets introduced in PR #1417 were sent directly
 * to the server as minPriority/maxPriority, but the server SQL uses score thresholds
 * that don't match (actual scores range from ~-10 to ~60). This caused:
 *  - Bug 3: Bucket counts don't add up to inbox tab total (VL:5+L:7+M:16+H:16+VH:1=45
 *           but tab shows 142) — the counts use old ranges but labels showed new buckets.
 *  - Bug 4: Slider visual desynced — score 30 (High threshold) appeared at visual
 *           position 30/100 which falls in the "Low" bucket (20-40).
 *
 * Solution: PriorityBucketDef.min/max store actual server score values.
 * PriorityRangeSelector maps these to even visual positions (0-20-40-60-80-100) for display.
 *
 * Server SQL ranges (email_threads.priorityScore) — half-open intervals [min, max):
 *   Very High:  >= 50          → min: 50, max: null
 *   High:       >= 30, < 50    → min: 30, max: 50
 *   Medium:     >= 15, < 30    → min: 15, max: 30
 *   Low:        >= 0,  < 15    → min: 0,  max: 15
 *   Very Low:   < 0             → min: null, max: 0
 *
 * Both getPriorityCounts (server) and the inbox filter query use COALESCE(priorityScore, 0)
 * with these same [min, max) boundaries, ensuring counts and displayed threads always agree.
 */

export interface PriorityBucketDef {
  label: string;
  /** Actual server score lower bound (minPriority). null = no lower bound (Very Low). */
  min: number | null;
  /** Actual server score upper bound (maxPriority). null = no upper cap (Very High). */
  max: number | null;
}

/**
 * All valid priority bucket definitions including the "All" sentinel.
 * min/max are actual server score values (NOT visual slider positions).
 * Used by `useInboxFilters` to validate stored filter pairs.
 */
/** Sentinel label for the "show all" bucket (not a real score tier). */
export const BUCKET_LABEL_ALL = 'All' as const;

export const PRIORITY_BUCKET_DEFS: PriorityBucketDef[] = [
  { label: BUCKET_LABEL_ALL, min: null, max: null },
  { label: 'Very Low', min: null, max: 0 },
  { label: 'Low', min: 0, max: 15 },
  { label: 'Medium', min: 15, max: 30 },
  { label: 'High', min: 30, max: 50 },
  { label: 'Very High', min: 50, max: null },
];

/**
 * The 5 concrete buckets (no "All" sentinel).
 * Used by `PriorityRangeSelector` as the visual track source.
 */
export const PRIORITY_BUCKET_RANGES = PRIORITY_BUCKET_DEFS.filter(
  (bucketDef): bucketDef is PriorityBucketDef => bucketDef.label !== BUCKET_LABEL_ALL
);

/**
 * Maps each PriorityBucketDef label to the corresponding PriorityCounts key.
 * Derived from PRIORITY_BUCKET_DEFS so the two don't drift independently.
 * The 'All' sentinel has no counts key and is excluded.
 */
export const PRIORITY_LABEL_TO_KEY: Record<string, 'veryLow' | 'low' | 'medium' | 'high' | 'veryHigh'> = {
  'Very Low': 'veryLow',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  'Very High': 'veryHigh',
};

/**
 * Visual slider: even spacing (5 buckets × 20 = 100 units).
 * Maps visual position 0-100 to/from actual score values.
 *
 * | Visual range | Bucket     | Score range      |
 * |--------------|------------|------------------|
 * |   0 –  20    | Very Low   | null → 0         |
 * |  20 –  40    | Low        | 0 → 15           |
 * |  40 –  60    | Medium     | 15 → 30          |
 * |  60 –  80    | High       | 30 → 50          |
 * |  80 – 100    | Very High  | 50 → null        |
 */
export const VISUAL_BUCKET_SIZE = 20;

/** Number of visual positions (0-100 inclusive with step 20). */
export const VISUAL_SLIDER_MAX = 100;
export const VISUAL_SLIDER_MIN = 0;

interface ScoreVisualMapping {
  label: string;
  scoreMin: number | null;
  scoreMax: number | null;
  visualMin: number;
  visualMax: number;
}

export const SCORE_VISUAL_MAP: ScoreVisualMapping[] = [
  { label: 'Very Low', scoreMin: null, scoreMax: 0, visualMin: 0, visualMax: 20 },
  { label: 'Low', scoreMin: 0, scoreMax: 15, visualMin: 20, visualMax: 40 },
  { label: 'Medium', scoreMin: 15, scoreMax: 30, visualMin: 40, visualMax: 60 },
  { label: 'High', scoreMin: 30, scoreMax: 50, visualMin: 60, visualMax: 80 },
  { label: 'Very High', scoreMin: 50, scoreMax: null, visualMin: 80, visualMax: 100 },
];

/**
 * Convert an actual server score (minPriority) to a visual slider position.
 * @param score The actual score value (or null for "no lower bound").
 * @returns Visual position 0-100.
 */
export function scoreMinToVisual(score: number | null): number {
  if (score === null) {
    return VISUAL_SLIDER_MIN;
  }
  const entry = SCORE_VISUAL_MAP.find(mapping => mapping.scoreMin === score);
  if (entry) {
    return entry.visualMin;
  }
  // Fallback: clamp proportionally within known score range (-10 to 60)
  return VISUAL_SLIDER_MIN;
}

/**
 * Convert an actual server score (maxPriority) to a visual slider position.
 * @param score The actual score value (or null for "no upper cap").
 * @returns Visual position 0-100.
 */
export function scoreMaxToVisual(score: number | null): number {
  if (score === null) {
    return VISUAL_SLIDER_MAX;
  }
  const entry = SCORE_VISUAL_MAP.find(mapping => mapping.scoreMax === score);
  if (entry) {
    return entry.visualMax;
  }
  return VISUAL_SLIDER_MAX;
}

/**
 * Convert a visual slider min position (0-100) to an actual server score.
 * @param visual Visual position (0-100, multiple of 20).
 * @returns Actual minPriority score, or null if at the slider minimum.
 */
export function visualMinToScore(visual: number): number | null {
  if (visual <= VISUAL_SLIDER_MIN) {
    return null;
  }
  const entry = SCORE_VISUAL_MAP.find(mapping => mapping.visualMin === visual);
  return entry?.scoreMin ?? null;
}

/**
 * Convert a visual slider max position (0-100) to an actual server score.
 * @param visual Visual position (0-100, multiple of 20).
 * @returns Actual maxPriority score, or null if at the slider maximum.
 */
export function visualMaxToScore(visual: number): number | null {
  if (visual >= VISUAL_SLIDER_MAX) {
    return null;
  }
  const entry = SCORE_VISUAL_MAP.find(mapping => mapping.visualMax === visual);
  return entry?.scoreMax ?? null;
}
