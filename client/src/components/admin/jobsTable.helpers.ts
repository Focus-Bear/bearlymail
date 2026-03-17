/**
 * Pure helper functions extracted from JobsTableBody.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60000;

export function formatDuration(ms: number | null, tFunc: (key: string) => string): string {
  if (ms === null || ms === undefined) {
    return tFunc('admin.jobs.noData');
  }
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  return `${minutes}m ${seconds}s`;
}
