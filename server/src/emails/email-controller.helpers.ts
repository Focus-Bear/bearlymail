import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import PgBoss from "pg-boss";

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
export const appendSignature = (
  emailBody: string,
  userSignature?: string | null,
): string => {
  const signature =
    userSignature ?? EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE;
  // Detect HTML body by the presence of angle-bracket tags
  if (/<[a-z][\s\S]*>/i.test(emailBody)) {
    return `${emailBody}<br><br>${signature}`;
  }
  return `${emailBody}\n\n${signature}`;
};

/**
 * Extended pg-boss interface to access internal methods not exposed in types.
 * These are used for advanced job queue operations (resetting stuck jobs, etc.).
 * pg-boss's TypeScript types don't expose these internal APIs.
 */
export interface PgBossWithInternals extends PgBoss {
  getQueueSize(name: string): Promise<number>;
  db: {
    executeSql(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowCount?: number; rows?: unknown[] }>;
  };
}

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
