import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { LessThan, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { registerWorker } from "../queue/register-worker";

/**
 * Periodic cleanup service that detects context analyses stuck in "running"
 * status for more than STUCK_ANALYSIS_TIMEOUT_MINUTES and marks them as failed.
 *
 * This is a safety net for cases where the worker crashes, PgBoss loses a job,
 * or the finalization processor exhausts its retry budget without this being
 * caught by the normal error path.
 *
 * Runs every 15 minutes via PgBoss schedule (Bug #4 fix for issue #1400).
 */
@Injectable()
export class ContextAnalysisCleanupService implements OnModuleInit {
  private readonly logger = new Logger(ContextAnalysisCleanupService.name);

  /** Analyses running longer than this are considered stuck and will be failed. */
  private static readonly STUCK_ANALYSIS_TIMEOUT_MINUTES = 60;

  /** Cron schedule: every 15 minutes. */
  private static readonly CLEANUP_CRON = "*/15 * * * *";

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `Registering stuck-analysis cleanup job (runs every 15 minutes, timeout: ${ContextAnalysisCleanupService.STUCK_ANALYSIS_TIMEOUT_MINUTES} min)`,
    );

    await this.boss.schedule(
      JOB_NAMES.CLEANUP_STUCK_ANALYSES,
      ContextAnalysisCleanupService.CLEANUP_CRON,
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.CLEANUP_STUCK_ANALYSES,
      async () => {
        await this.cleanupStuckAnalyses();
      },
    );

    this.logger.log("Stuck-analysis cleanup job registered successfully");
  }

  /**
   * Find all analyses that have been in "running" status for longer than
   * STUCK_ANALYSIS_TIMEOUT_MINUTES and mark them as "failed".
   */
  async cleanupStuckAnalyses(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        ContextAnalysisCleanupService.STUCK_ANALYSIS_TIMEOUT_MINUTES *
          MILLISECONDS.MINUTE,
    );

    let stuckAnalyses: ContextAnalysis[];
    try {
      stuckAnalyses = await this.contextAnalysisRepository.find({
        where: {
          status: "running",
          updatedAt: LessThan(cutoff),
        },
        select: {
          id: true,
          userId: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      this.logger.error("Failed to query for stuck analyses", err);
      return;
    }

    if (stuckAnalyses.length === 0) {
      this.logger.debug("No stuck analyses found");
      return;
    }

    this.logger.warn(
      `Found ${stuckAnalyses.length} stuck analysis/analyses (running > ${ContextAnalysisCleanupService.STUCK_ANALYSIS_TIMEOUT_MINUTES} min). Marking as failed.`,
    );

    for (const analysis of stuckAnalyses) {
      try {
        await this.contextAnalysisRepository.update(
          { id: analysis.id },
          {
            status: "failed",
            errorMessage: `Analysis timed out after ${ContextAnalysisCleanupService.STUCK_ANALYSIS_TIMEOUT_MINUTES} minutes in "running" state. Please try again.`,
          },
        );
        this.logger.warn(
          `Marked stuck analysis ${analysis.id} (user ${analysis.userId}, last updated ${analysis.updatedAt.toISOString()}) as failed`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to mark analysis ${analysis.id} as failed`,
          err,
        );
      }
    }
  }
}
