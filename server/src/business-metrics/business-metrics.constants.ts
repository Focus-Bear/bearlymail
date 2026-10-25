/** Daily at 00:20 UTC, so the snapshot covers the UTC day that just ended. */
export const BUSINESS_METRICS_SNAPSHOT_CRON = "20 0 * * *";

/** Length of `YYYY-MM-DD` at the start of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** The UTC calendar date (YYYY-MM-DD) of an instant. */
export function utcDateOf(instant: Date): string {
  return instant.toISOString().slice(0, ISO_DATE_LENGTH);
}
