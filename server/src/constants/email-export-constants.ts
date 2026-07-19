import { MILLISECONDS, SECONDS } from "./time-constants";

/** Retry once on transient failure (e.g. a flaky S3 PUT). */
const EXPORT_JOB_RETRY_LIMIT = 1;

/** Tuning for the asynchronous bulk email export (#2024). */
export const EMAIL_EXPORT = {
  /** How long a generated export stays downloadable before the S3 lifecycle removes it. */
  TTL_MS: MILLISECONDS.DAY,
  /** PgBoss job expiry — large mailboxes can take a while to zip. */
  JOB_EXPIRE_SECONDS: SECONDS.HOUR,
  /** Retry once on transient failure (e.g. a flaky S3 PUT). */
  JOB_RETRY_LIMIT: EXPORT_JOB_RETRY_LIMIT,
  /** Seconds to wait before retrying a failed export build. */
  JOB_RETRY_DELAY_SECONDS: SECONDS.MINUTE,
} as const;
