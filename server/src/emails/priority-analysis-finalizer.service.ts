import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { In, LessThan, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityAnalysisRun } from "../database/entities/priority-analysis-run.entity";
import { registerWorker } from "../queue/register-worker";

/**
 * Tracks Lambda-dispatched priority analysis runs and unlocks threads that get
 * stuck when a Lambda invocation fails after setting isProcessingPriority=true.
 *
 * Registers a periodic PgBoss job (every 5 minutes) that:
 * 1. Finds runs in "running" status older than STALL_TIMEOUT_MS
 * 2. Resets isProcessingPriority=false for their associated threads
 * 3. Marks the run as "failed" so the StuckPriorityDetectionService can re-queue them
 */
@Injectable()
export class PriorityAnalysisFinalizerService implements OnModuleInit {
  private readonly logger = new Logger(PriorityAnalysisFinalizerService.name);

  /** Treat a run as stalled if it hasn't completed within this window. */
  private static readonly STALL_TIMEOUT_MS = 5 * MILLISECONDS.MINUTE;

  /** Cron: every 5 minutes. */
  private static readonly SCAN_CRON = "*/5 * * * *";

  /** Maximum number of stalled runs to finalize per scan cycle. */
  private static readonly MAX_STALLED_RUNS_PER_SCAN = 50;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(PriorityAnalysisRun)
    private readonly runRepository: Repository<PriorityAnalysisRun>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      "Registering priority analysis finalizer job (runs every 5 minutes)",
    );

    await this.boss.schedule(
      JOB_NAMES.FINALIZE_STALLED_PRIORITY_RUNS,
      PriorityAnalysisFinalizerService.SCAN_CRON,
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.FINALIZE_STALLED_PRIORITY_RUNS,
      async () => {
        await this.detectAndFinalizeStalledRuns();
      },
    );

    this.logger.log("Priority analysis finalizer job registered successfully");
  }

  /**
   * Create a tracking record for a newly dispatched Lambda analysis run.
   */
  async createRun(opts: {
    analysisId: string;
    userId: string;
    totalBatches: number;
    threadIds: string[];
  }): Promise<void> {
    const { analysisId, userId, totalBatches, threadIds } = opts;
    const run = this.runRepository.create({
      id: analysisId,
      userId,
      totalBatches,
      completedBatches: 0,
      status: "running",
      threadIds,
    });
    await this.runRepository.save(run);
    this.logger.log(
      `[PRIORITY-FINALIZER] Created run ${analysisId} (${totalBatches} batches, ${threadIds.length} threads)`,
    );
  }

  /**
   * Find runs that have been in "running" state longer than STALL_TIMEOUT_MS
   * and unlock their associated threads.
   */
  async detectAndFinalizeStalledRuns(): Promise<void> {
    const cutoff = new Date(
      Date.now() - PriorityAnalysisFinalizerService.STALL_TIMEOUT_MS,
    );

    const stalledRuns = await this.runRepository.find({
      where: { status: "running", createdAt: LessThan(cutoff) },
      take: PriorityAnalysisFinalizerService.MAX_STALLED_RUNS_PER_SCAN,
      order: { createdAt: "ASC" },
    });

    if (stalledRuns.length === 0) {
      this.logger.debug(
        "[PRIORITY-FINALIZER] No stalled priority analysis runs found",
      );
      return;
    }

    this.logger.warn(
      `[PRIORITY-FINALIZER] Found ${stalledRuns.length} stalled priority analysis run(s) — unlocking threads`,
    );

    for (const run of stalledRuns) {
      await this.finalizeRun(run);
    }
  }

  private async finalizeRun(run: PriorityAnalysisRun): Promise<void> {
    const threadIds = run.threadIds ?? [];

    if (threadIds.length > 0) {
      try {
        await this.emailThreadRepository.update(
          { id: In(threadIds), isProcessingPriority: true },
          { isProcessingPriority: false },
        );
        this.logger.log(
          `[PRIORITY-FINALIZER] Unlocked up to ${threadIds.length} thread(s) for stalled run ${run.id}`,
        );
      } catch (err) {
        this.logger.error(
          `[PRIORITY-FINALIZER] Failed to unlock threads for run ${run.id}:`,
          err,
        );
      }
    }

    try {
      await this.runRepository.update(
        { id: run.id },
        { status: "failed", updatedAt: new Date() },
      );
    } catch (err) {
      this.logger.error(
        `[PRIORITY-FINALIZER] Failed to mark run ${run.id} as failed:`,
        err,
      );
    }
  }
}
