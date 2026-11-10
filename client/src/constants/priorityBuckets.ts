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
 * Used by the priority checkbox filter (one checkbox per bucket).
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
