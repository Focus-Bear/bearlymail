/**
 * Counting helpers shared by the filter header and the first-import list refresh.
 */
import { BUCKET_LABEL_ALL, PRIORITY_BUCKET_DEFS, PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';
import { PriorityCounts } from 'hooks/usePriorityCounts';

/** Threads inside [minPriority, maxPriority) according to the per-bucket counts. */
export function countThreadsInPriorityRange(
  counts: PriorityCounts,
  minPriority: number | null,
  maxPriority: number | null
): number {
  const filterMin = minPriority ?? -Infinity;
  const filterMax = maxPriority ?? Infinity;
  return PRIORITY_BUCKET_DEFS.filter(bucket => bucket.label !== BUCKET_LABEL_ALL)
    .filter(bucket => (bucket.min ?? -Infinity) < filterMax && (bucket.max ?? Infinity) > filterMin)
    .reduce((sum, bucket) => sum + (counts[PRIORITY_LABEL_TO_KEY[bucket.label]] ?? 0), 0);
}

export interface EmptyTriageListRefetchInput {
  isTriage: boolean;
  /** The list finished loading and shows no threads. */
  isListEmpty: boolean;
  /** Threads the latest priority counts place inside the active filter range. */
  threadsInRange: number;
}

/**
 * The Triage list was fetched before the first import scored anything High, so it is empty
 * while the counts now say the filtered range has mail. Nothing else refreshes an empty list
 * (the processing poll only watches visible rows), so it must be refetched.
 */
export function shouldRefetchEmptyTriageList({ isTriage, isListEmpty, threadsInRange }: EmptyTriageListRefetchInput): boolean {
  return isTriage && isListEmpty && threadsInRange > 0;
}
