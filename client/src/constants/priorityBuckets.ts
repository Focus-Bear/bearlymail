/**
 * Priority bucket definitions — single source of truth for the 5-bucket 0-100 slider.
 *
 * Both `PriorityRangeSelector` (UI) and `useInboxFilters` (state / PRIORITY_RANGES)
 * derive their values from here, eliminating the previous two-sources-of-truth bug.
 *
 * Buckets: Very Low (0–20), Low (20–40), Medium (40–60), High (60–80), Very High (80–100).
 * Boundaries are inclusive lower / exclusive upper, except the final bucket (null = no cap).
 */

export const BUCKET_SIZE = 20;

export interface PriorityBucketDef {
  label: string;
  /** Inclusive lower bound (maps to minPriority). null for the "All" sentinel. */
  min: number | null;
  /** Inclusive upper bound (maps to maxPriority). null = no upper cap. */
  max: number | null;
}

/**
 * All valid priority bucket definitions including the "All" sentinel.
 * Used by `useInboxFilters` to validate stored filter pairs.
 */
export const PRIORITY_BUCKET_DEFS: PriorityBucketDef[] = [
  { label: 'All',       min: null, max: null  },
  { label: 'Very Low',  min: 0,    max: 20    },
  { label: 'Low',       min: 20,   max: 40    },
  { label: 'Medium',    min: 40,   max: 60    },
  { label: 'High',      min: 60,   max: 80    },
  { label: 'Very High', min: 80,   max: null  },
];

/**
 * The 5 concrete buckets (no "All" sentinel).
 * Used by `PriorityRangeSelector` as the visual track source, extended with
 * display-only properties (trackColor, dotColor).
 */
export const PRIORITY_BUCKET_RANGES = PRIORITY_BUCKET_DEFS.filter(
  (bucketDef): bucketDef is PriorityBucketDef & { min: number } => bucketDef.min !== null,
);
