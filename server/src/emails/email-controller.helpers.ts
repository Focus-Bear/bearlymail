import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type { PgBoss } from "pg-boss";

import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";

// Performance budget for batch-status endpoint (ms)
export const BATCH_STATUS_BUDGET = 500;

// Default and limit values for email controller endpoints
export const EMAIL_CONTROLLER_DEFAULTS = {
  MAX_RESULTS: 50,
  DAYS: 30,
  MAX_DAYS: 90,
  PRIORITY_SCORE: 50,
  DEFAULT_SIGNATURE: "Sent from BearlyMail (anti inbox overwhelm system)",
} as const;

/**
 * Appends the user's email signature (or the default BearlyMail signature) to
 * an outgoing email body.
 *
 * When the body contains HTML markup, the signature is appended with `<br><br>`
 * to preserve correct rendering in HTML email clients. Plain-text bodies use
 * `\n\n` as before.
 */
/**
 * True when a body appears to be HTML (contains an angle-bracket tag). The
 * tag-body length is bounded (`[^>]{0,2048}`) so the test can't retry-and-
 * backtrack polynomially on inputs like '<a<a<a' with no closing '>' (ReDoS,
 * CWE-1333).
 */
export const looksLikeHtml = (body: string): boolean =>
  /<[a-z][^>]{0,2048}>/i.test(body);

export const appendSignature = (
  emailBody: string,
  userSignature?: string | null,
): string => {
  const signature =
    userSignature ?? EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE;
  if (looksLikeHtml(emailBody)) {
    return `${emailBody}<br><br>${signature}`;
  }
  return `${emailBody}\n\n${signature}`;
};

/**
 * pg-boss's internal database handle for raw SQL against the `pgboss` schema
 * (e.g. counting jobs by state for progress reporting).
 *
 * pg-boss's published `getDb()` type narrows the result to `{ rows: any[] }`,
 * but the underlying driver returns a full `pg.QueryResult` — so `rowCount`
 * (used by the job-cancel call sites) is also available at runtime. `params`
 * is optional here since several queries take no bind parameters.
 */
export interface BossDb {
  executeSql(
    sql: string,
    params?: unknown[],
  ): Promise<{ rowCount?: number; rows?: unknown[] }>;
}

/**
 * Returns pg-boss's internal database handle for running raw SQL against the
 * `pgboss` schema.
 *
 * pg-boss v11 keeps the connection on a private field and exposes it only via
 * the `getDb()` method — the old public `boss.db` property was removed, so
 * reading it now yields `undefined` and `db.executeSql(...)` throws
 * `Cannot read properties of undefined`. Routing every raw-SQL call site
 * through this helper keeps them correct across pg-boss upgrades.
 */
export const getBossDb = (boss: PgBoss): BossDb =>
  (boss as unknown as { getDb(): BossDb }).getDb();

export class BatchStatusPerformanceTracker {
  private startTime: number;
  private logger = new Logger("BatchStatusPerformanceTracker");
  private logFile = path.join(LOGS_DIR, "performance.log");

  constructor() {
    this.startTime = Date.now();
    ensureLogsDirSync();
  }

  finish(): void {
    const duration = Date.now() - this.startTime;
    if (duration > BATCH_STATUS_BUDGET) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: "batch-status",
        duration,
        budget: BATCH_STATUS_BUDGET,
        exceeded: true,
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;
      this.logger.warn(
        `⚠️ PERF ISSUE: batch-status took ${duration}ms (budget: ${BATCH_STATUS_BUDGET}ms)`,
      );

      // Development only. In production the container filesystem is read-only,
      // so the write throws ENOENT every time and the error log itself becomes
      // high-volume CloudWatch spam.
      if (isDevelopment) {
        try {
          fs.appendFileSync(this.logFile, logLine);
        } catch (err) {
          this.logger.error("Failed to write to performance log file:", err);
        }
      }
    }
  }
}
