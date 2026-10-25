import { DAYS, MONTHS_PER_YEAR } from "../constants/time-constants";

/** Daily at 00:20 UTC, so the snapshot covers the UTC day that just ended. */
export const BUSINESS_METRICS_SNAPSHOT_CRON = "20 0 * * *";

/** Env vars that configure the daily cost snapshot. */
export const COST_SNAPSHOT_ENV = {
  /** "true" turns the cost snapshot on; it is off by default. */
  ENABLED: "COST_SNAPSHOT_ENABLED",
  /**
   * JSON object of fixed monthly spend in USD by category, e.g.
   * {"aws":410,"pusher":49}. Each category is spread evenly over the year.
   */
  FIXED_MONTHLY_USD: "COST_SNAPSHOT_FIXED_MONTHLY_USD",
} as const;

/** Every cost property is in this currency. */
export const COST_CURRENCY = "USD";

/** Category keys become property names, so keep them short snake_case. */
export const COST_CATEGORY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Average days per month, for spreading a monthly cost over single days. */
export const AVERAGE_DAYS_PER_MONTH = DAYS.YEAR / MONTHS_PER_YEAR;

/** Length of `YYYY-MM-DD` at the start of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** The UTC calendar date (YYYY-MM-DD) of an instant. */
export function utcDateOf(instant: Date): string {
  return instant.toISOString().slice(0, ISO_DATE_LENGTH);
}
