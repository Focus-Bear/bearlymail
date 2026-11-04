export const RECATEGORISE_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  /** Past the max wait: the user may go, while the jobs finish server-side. */
  STILL_RUNNING: 'stillRunning',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type RecategoriseStatus = (typeof RECATEGORISE_STATUS)[keyof typeof RECATEGORISE_STATUS];

/** One category's share of the triage inbox, from GET /onboarding/category-counts. */
export interface CategoryCount {
  /** null is "Other". */
  categoryId: string | null;
  /** null for "Other", which the client localises. */
  name: string | null;
  count: number;
}

/** GET /emails/recategorize-progress for one batch of re-categorisation jobs. */
export interface RecategoriseJobProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

/** POST /emails/recategorize-triage. `batchId` is null when the inbox had nothing to re-sort. */
export interface RecategoriseStartResponse {
  batchId: string | null;
  queued: number;
}

/** Every queued job has finished (failed ones included: they keep their old category). */
export function isBatchFinished(progress: RecategoriseJobProgress): boolean {
  return progress.total > 0 && progress.pending === 0;
}

export function isCategoryCountList(value: unknown): value is CategoryCount[] {
  return (
    Array.isArray(value) &&
    value.every(
      entry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).count === 'number' &&
        ((entry as Record<string, unknown>).name === null ||
          typeof (entry as Record<string, unknown>).name === 'string')
    )
  );
}

export function isJobProgress(value: unknown): value is RecategoriseJobProgress {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return ['total', 'completed', 'failed', 'pending'].every(key => typeof candidate[key] === 'number');
}
