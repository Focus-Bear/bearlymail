import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { DataSource } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";

/** One table's retention policy: delete rows whose `column` is older than `days`. */
interface RetentionPolicy {
  table: string;
  column: string;
  days: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Retention policies for high-volume / ephemeral tables. token_usage keeps 30
 * days (analytics history); debug_data and the audit logs keep 14 days. The
 * debug_data sweep is a hard cap that complements the per-feature
 * DebugCleanupService (so no feature can retain beyond 14 days).
 */
const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  { table: "token_usage", column: "createdAt", days: 30 },
  { table: "debug_data", column: "createdAt", days: 14 },
  { table: "auto_response_logs", column: "sentAt", days: 14 },
  { table: "sync_history_logs", column: "syncedAt", days: 14 },
  { table: "prompt_examples", column: "capturedAt", days: 14 },
] as const;

/** Rows deleted per statement, to avoid long locks on large first runs. */
const DELETE_BATCH_SIZE = 5000;

/** Safety cap on batches per table per run (DELETE_BATCH_SIZE × this = max/run). */
const MAX_BATCHES_PER_TABLE = 200;

/**
 * Daily cron that prunes old rows from high-volume/ephemeral tables per
 * RETENTION_POLICIES. Deletes in bounded batches so a large first run can't
 * hold a long lock; whatever isn't cleared in one run is picked up the next day.
 */
@Injectable()
export class DataRetentionService implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionService.name);

  /** Cron: daily at 03:30 UTC (offset from the 02:00 debug cleanup). */
  private static readonly SCAN_CRON = "30 3 * * *";

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.boss.schedule(
        JOB_NAMES.PRUNE_OLD_DATA,
        DataRetentionService.SCAN_CRON,
      );
      await registerWorker(this.boss, JOB_NAMES.PRUNE_OLD_DATA, async () => {
        await this.pruneAll();
      });
      this.logger.log("Data-retention sweep registered (daily 03:30 UTC)");
    } catch (err) {
      // Scheduling failure must not crash module init.
      this.logger.error("Failed to register data-retention sweep", err);
    }
  }

  /**
   * Run every retention policy. Each table is isolated so one failure doesn't
   * stop the rest, but any failure is rethrown at the end so the pg-boss job
   * is marked failed and we can alert on it.
   */
  async pruneAll(): Promise<void> {
    const failures: string[] = [];
    for (const policy of RETENTION_POLICIES) {
      try {
        const deleted = await this.prune(policy);
        if (deleted > 0) {
          this.logger.log(
            `[RETENTION] Pruned ${deleted} rows from ${policy.table} (> ${policy.days}d)`,
          );
        }
      } catch (err) {
        this.logger.error(`[RETENTION] Failed to prune ${policy.table}`, err);
        failures.push(policy.table);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Data-retention sweep failed for tables: ${failures.join(", ")}`,
      );
    }
  }

  private async prune(policy: RetentionPolicy): Promise<number> {
    const cutoff = new Date(Date.now() - policy.days * MS_PER_DAY);
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
      // ctid sub-select + LIMIT keeps each DELETE small; RETURNING lets us count.
      const rows: unknown[] = await this.dataSource.query(
        `DELETE FROM "${policy.table}"
         WHERE ctid IN (
           SELECT ctid FROM "${policy.table}"
           WHERE "${policy.column}" < $1
           LIMIT $2
         ) RETURNING 1`,
        [cutoff, DELETE_BATCH_SIZE],
      );
      total += rows.length;
      if (rows.length < DELETE_BATCH_SIZE) break;
    }
    return total;
  }
}
