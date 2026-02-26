import { Logger } from "@nestjs/common";
import PgBoss from "pg-boss";
import * as fs from "fs";
import * as path from "path";

// Performance budget for batch-status endpoint (ms)
export const BATCH_STATUS_BUDGET = 500;

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
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(
    BatchStatusPerformanceTracker.logsDir,
    "performance.log",
  );

  constructor() {
    this.startTime = Date.now();
    if (!fs.existsSync(BatchStatusPerformanceTracker.logsDir)) {
      fs.mkdirSync(BatchStatusPerformanceTracker.logsDir, { recursive: true });
    }
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

      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
      }
    }
  }
}
