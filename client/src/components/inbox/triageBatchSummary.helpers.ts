import { PriorityCounts } from 'hooks/usePriorityCounts';

export interface TriageBandPart {
  /** i18n key for the band label — same keys getPriorityBadge uses for the badge labels. */
  labelKey: string;
  count: number;
}

/**
 * Total number of threads in the triage batch across all priority bands,
 * including threads whose priority has not been calculated yet.
 * Counts come from the API, so missing fields are treated as 0.
 */
export function getTriageBatchTotal(counts: Partial<PriorityCounts>): number {
  return (
    (counts.veryHigh ?? 0) +
    (counts.high ?? 0) +
    (counts.medium ?? 0) +
    (counts.low ?? 0) +
    (counts.veryLow ?? 0) +
    (counts.unprioritised ?? 0)
  );
}

/**
 * Non-empty priority bands in display order (highest first), using the exact
 * label keys the priority badge uses (see getPriorityBadge in utils/priorityUtils).
 * Unprioritised threads are excluded — they are surfaced separately by the
 * "Analysing priority..." category.
 */
export function getTriageBandParts(counts: Partial<PriorityCounts>): TriageBandPart[] {
  const bands: TriageBandPart[] = [
    { labelKey: 'priority.veryHigh', count: counts.veryHigh ?? 0 },
    { labelKey: 'priority.high', count: counts.high ?? 0 },
    { labelKey: 'priority.medium', count: counts.medium ?? 0 },
    { labelKey: 'priority.low', count: counts.low ?? 0 },
    { labelKey: 'priority.veryLow', count: counts.veryLow ?? 0 },
  ];
  return bands.filter(band => band.count > 0);
}
