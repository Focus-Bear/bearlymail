import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import type { PgBoss, WorkOptions } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { PriorityLearningService } from "./priority-learning.service";

@Injectable()
export class PriorityLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(PriorityLearningProcessor.name);
  private readonly learnConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private priorityLearningService: PriorityLearningService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For learning jobs (I/O bound - DB writes), use moderate concurrency
    const defaultConcurrency = Math.max(3, Math.min(cpuCores, 5));

    this.learnConcurrency = parseInt(
      this.configService.get<string>("JOB_LEARN_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, learn-from-star concurrency: ${this.learnConcurrency}`,
    );
  }

  async onModuleInit() {
    // Worker for learning from star selections - process multiple jobs in parallel
    this.logger.log(
      `Starting learn-from-star worker with concurrency: ${this.learnConcurrency}`,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.LEARN_FROM_STAR,
      // teamSize is a valid pg-boss work option for parallel job processing
      { teamSize: this.learnConcurrency } as WorkOptions,
      async (job) => {
        const { userId, emailId, starCount } = job.data as {
          userId: string;
          emailId: string;
          starCount: number;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.LEARN_FROM_STAR,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId, emailId });

        this.logger.log(
          `[Worker ${workerId}] Learning from star selection for email ${emailId}, starCount: ${starCount}`,
        );

        try {
          // Wrap in the user's KMS key context: learnFromStarSelection reads
          // per-user-encrypted Email/EmailThread/UserContext rows, which fail
          // (and previously crashed the worker) without the per-user key.
          await this.userEncryptionService.withUserKey(userId, () =>
            this.priorityLearningService.learnFromStarSelection(
              userId,
              emailId,
              starCount,
            ),
          );
          this.logger.log(
            `[Worker ${workerId}] Completed learning for email ${emailId}`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to learn from star selection for email ${emailId}`,
            error,
          );
          tracker.finish(error as Error);
          // Don't throw - learning failures shouldn't block other operations
        }
      },
    );

    this.logger.log("Priority learning processor initialized");
  }
}
