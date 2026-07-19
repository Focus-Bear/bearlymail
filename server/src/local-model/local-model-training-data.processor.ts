import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { LocalModelTrainingDataService } from "./local-model-training-data.service";

interface ExportTrainingDataJob {
  userId: string;
}

/** Default export cadence: Saturday 04:00 UTC, ahead of the Sunday trainer.
 * Override with LOCAL_MODEL_EXPORT_CRON to retrain more often (e.g. twice-weekly
 * `0 4 * * 2,6`) — keep it in step with the Fargate trainer's schedule. */
const DEFAULT_EXPORT_CRON = "0 4 * * 6";

/**
 * Weekly data-feed for the local-model training loop. A cron scheduler fans out
 * one per-user export job; each writes that user's label-rich data to
 * `training-data/<userId>.json` in the models bucket. Runs on Saturday, ahead of
 * the Sunday Fargate trainer that reads those files (see SERVING.md).
 *
 * No-op unless LOCAL_MODELS_BUCKET is configured, so it's inert until the
 * serving stack is wired to the worker.
 */
@Injectable()
export class LocalModelTrainingDataProcessor implements OnModuleInit {
  private readonly logger = new Logger(LocalModelTrainingDataProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly usersService: UsersService,
    private readonly trainingDataService: LocalModelTrainingDataService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.trainingDataService.isConfigured()) {
      this.logger.log(
        "LOCAL_MODELS_BUCKET not set — training-data feed disabled",
      );
      return;
    }
    const cron =
      this.configService.get<string>("LOCAL_MODEL_EXPORT_CRON")?.trim() ||
      DEFAULT_EXPORT_CRON;
    this.logger.log(`Scheduling training-data export with cron "${cron}"`);
    await this.boss.schedule(JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT, cron);
    await this.registerSchedulerWorker();
    await this.registerExportWorker();
    await this.bootstrapInitialExport();
  }

  /**
   * Kick off an export run on startup so a fresh deploy populates
   * `training-data/` without waiting for the weekly Saturday cron — otherwise the
   * trainer has nothing to read until the next scheduled slot. The singleton
   * window dedupes across the worker's cluster processes and frequent restarts,
   * so this enqueues at most once per window rather than on every boot.
   */
  private async bootstrapInitialExport(): Promise<void> {
    await this.boss.send(
      JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT,
      {},
      {
        priority: getJobPriority(JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT),
        singletonKey: "schedule-training-data-export-bootstrap",
        singletonSeconds: SECONDS.SIX_HOURS,
      },
    );
    this.logger.log("Enqueued startup training-data export bootstrap");
  }

  /** Cron worker: enqueue a per-user export for every onboarded user. */
  private async registerSchedulerWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT,
      async () => {
        const users = await this.usersService.findAll();
        const eligible = users.filter((user) => user.hasCompletedOnboarding);
        this.logger.log(
          `Scheduling training-data export for ${eligible.length} users`,
        );
        await this.enqueueUserExports(eligible.map((user) => user.id));
      },
    );
  }

  /** Enqueue per-user export jobs in parallel chunks (avoids the sequential
   * await bottleneck while bounding concurrent inserts). singletonKey dedupes
   * if a previous week's job is still queued. */
  private async enqueueUserExports(userIds: string[]): Promise<void> {
    const CHUNK_SIZE = 100;
    for (let start = 0; start < userIds.length; start += CHUNK_SIZE) {
      const chunk = userIds.slice(start, start + CHUNK_SIZE);
      await Promise.all(
        chunk.map((userId) =>
          this.boss.send(
            JOB_NAMES.EXPORT_TRAINING_DATA,
            { userId },
            {
              priority: getJobPriority(JOB_NAMES.EXPORT_TRAINING_DATA),
              singletonKey: `export-training-data-${userId}`,
            },
          ),
        ),
      );
    }
  }

  /** Per-user worker: export one user's training data to S3. */
  private async registerExportWorker(): Promise<void> {
    await registerWorker<ExportTrainingDataJob>(
      this.boss,
      JOB_NAMES.EXPORT_TRAINING_DATA,
      async (job) => {
        const { userId } = job.data;
        try {
          const result =
            await this.trainingDataService.exportUserTrainingData(userId);
          if (!result.uploaded) {
            this.logger.log(
              `Skipped training-data export for ${userId}: ${result.reason} (${result.recordCount} records)`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Training-data export failed for ${userId}: ${message}`,
          );
          // Re-throw so PgBoss retries this user's export.
          throw error;
        }
      },
    );
  }
}
