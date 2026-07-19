/**
 * Pure helper functions extracted from PrivateNotesSection.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function humanizeDuration(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${hours}h ago`;
}
