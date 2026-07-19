import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { registerWorker } from "../queue/register-worker";
import { DebugService } from "./debug.service";

const DEBUG_CLEANUP_JOB = JOB_NAMES.DEBUG_DATA_CLEANUP;

/** Runs daily cleanup of expired debug_data rows. */
@Injectable()
export class DebugCleanupService implements OnModuleInit {
  private readonly logger = new Logger(DebugCleanupService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly debugService: DebugService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Schedule daily cleanup job at 02:00 UTC
      await this.boss.schedule(DEBUG_CLEANUP_JOB, "0 2 * * *", {});
      await registerWorker(this.boss, DEBUG_CLEANUP_JOB, async () => {
        this.logger.log("Running scheduled debug_data cleanup...");
        try {
          const deleted = await this.debugService.cleanupExpiredData();
          this.logger.log(`Debug cleanup complete: ${deleted} rows deleted`);
        } catch (err) {
          this.logger.error("Debug cleanup job failed", err);
          throw err;
        }
      });
    } catch (err) {
      // Scheduling failure should not crash the module — log and continue.
      this.logger.error(
        "Failed to schedule or register debug_data cleanup job",
        err,
      );
    }
  }
}
