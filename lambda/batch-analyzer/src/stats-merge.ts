/**
 * Pure merge logic for `context_analyses.stats` batch bookkeeping, shared by the
 * DB writers and unit-tested without a database.
 *
 * The server finaliser counts `Object.keys(stats.batchResults)` as completed and
 * `stats.failedBatches` as failed, and the admin panel treats any batchResults
 * entry carrying `error` as a failure. Both writers must keep those two views in
 * step: a failure is recorded in BOTH places (matching the server worker in
 * context-batch-analysis.processor.ts), and a later successful retry replaces the
 * failure record and clears the index from `failedBatches`.
 */

export type AnalysisStats = Record<string, unknown>;

export interface BatchFailureRecord {
  error: string;
  failedAt: string;
  errorType: string;
  correlationId: string;
}

export function getBatchResultsMap(
  stats: AnalysisStats,
): Record<string, unknown> {
  const br = stats.batchResults;
  if (br && typeof br === "object" && !Array.isArray(br)) {
    return { ...(br as Record<string, unknown>) };
  }
  return {};
}

export function getFailedBatches(stats: AnalysisStats): number[] {
  const failed = stats.failedBatches;
  return Array.isArray(failed)
    ? failed.filter((index): index is number => Number.isInteger(index))
    : [];
}

function isFailureRecord(entry: unknown): boolean {
  return (
    entry != null &&
    typeof entry === "object" &&
    typeof (entry as { error?: unknown }).error === "string"
  );
}

/**
 * Returns the stats with `result` stored for `batchIndex`, or `null` when the
 * batch already has a successful result (idempotent re-delivery: no-op).
 * A prior failure record is replaced and the index removed from `failedBatches`.
 */
export function mergeBatchResult(
  stats: AnalysisStats,
  batchIndex: number,
  result: unknown,
): AnalysisStats | null {
  const key = String(batchIndex);
  const batchResults = getBatchResultsMap(stats);
  const existing = batchResults[key];
  if (existing != null && !isFailureRecord(existing)) {
    return null;
  }
  batchResults[key] = result;
  const failedBatches = getFailedBatches(stats).filter(
    (index) => index !== batchIndex,
  );
  return { ...stats, batchResults, failedBatches };
}

/**
 * Returns the stats with `failure` recorded for `batchIndex` in both
 * `batchResults` and `failedBatches`, or `null` when the batch already has any
 * record (a success must never be downgraded; a repeat failure is a no-op).
 */
export function mergeBatchFailure(
  stats: AnalysisStats,
  batchIndex: number,
  failure: BatchFailureRecord,
): AnalysisStats | null {
  const key = String(batchIndex);
  const batchResults = getBatchResultsMap(stats);
  if (batchResults[key] != null) {
    return null;
  }
  batchResults[key] = failure;
  const failedBatches = getFailedBatches(stats);
  if (!failedBatches.includes(batchIndex)) failedBatches.push(batchIndex);
  return { ...stats, batchResults, failedBatches };
}
