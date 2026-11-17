/**
 * Pure state logic for the priority checkbox filter.
 *
 * The server filters by one score range (minPriority / maxPriority), so the checkboxes
 * always describe a run of ADJACENT buckets. Ticking a bucket outside the run stretches
 * the run to reach it; unticking an end bucket shrinks it; unticking a bucket in the
 * middle keeps the higher-priority side (top priority is what the inbox is about).
 */
import { PRIORITY_BUCKET_RANGES, PriorityBucketDef } from 'constants/priorityBuckets';

export interface PriorityRange {
  minPriority: number | null;
  maxPriority: number | null;
}

/** Buckets ordered highest priority first: the checkboxes read Very High (left) → Very Low (right). */
export const PRIORITY_BUCKETS_HIGH_FIRST: readonly PriorityBucketDef[] = [...PRIORITY_BUCKET_RANGES].reverse();

function isBucketInRange(bucket: PriorityBucketDef, range: PriorityRange): boolean {
  const isAboveFloor =
    range.minPriority === null || (bucket.min !== null && bucket.min >= range.minPriority);
  const isBelowCap =
    range.maxPriority === null || (bucket.max !== null && bucket.max <= range.maxPriority);
  return isAboveFloor && isBelowCap;
}

/** Indexes (into PRIORITY_BUCKETS_HIGH_FIRST) of the buckets the range covers, ascending. */
export function getCheckedBucketIndexes(range: PriorityRange): number[] {
  return PRIORITY_BUCKETS_HIGH_FIRST.flatMap((bucket, index) => (isBucketInRange(bucket, range) ? [index] : []));
}

/** The score range covering buckets `firstIndex`..`lastIndex` of PRIORITY_BUCKETS_HIGH_FIRST. */
function rangeFromBucketSpan(firstIndex: number, lastIndex: number): PriorityRange {
  return {
    minPriority: PRIORITY_BUCKETS_HIGH_FIRST[lastIndex].min,
    maxPriority: PRIORITY_BUCKETS_HIGH_FIRST[firstIndex].max,
  };
}

/** The range after the user ticks or unticks bucket `index`. At least one bucket stays ticked. */
export function togglePriorityBucket(range: PriorityRange, index: number): PriorityRange {
  const checked = getCheckedBucketIndexes(range);
  if (checked.length === 0) {
    return rangeFromBucketSpan(index, index);
  }
  const firstIndex = checked[0];
  const lastIndex = checked[checked.length - 1];

  if (!checked.includes(index)) {
    return rangeFromBucketSpan(Math.min(firstIndex, index), Math.max(lastIndex, index));
  }
  if (checked.length === 1) {
    return range;
  }
  if (index === firstIndex) {
    return rangeFromBucketSpan(firstIndex + 1, lastIndex);
  }
  if (index === lastIndex) {
    return rangeFromBucketSpan(firstIndex, lastIndex - 1);
  }
  return rangeFromBucketSpan(firstIndex, index - 1);
}
