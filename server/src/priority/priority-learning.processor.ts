import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { PriorityLearningService } from "./priority-learning.service";

@Injectable()
export class PriorityLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(PriorityLearningProcessor.name);
  private readonly learnConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private priorityLearningService: PriorityLearningService,
    private configService: ConfigService,
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
    await this.boss.work(
      "learn-from-star",
      { teamSize: this.learnConcurrency } as any,
      async (job) => {
        const { userId, emailId, starCount } = job.data as {
          userId: string;
          emailId: string;
          starCount: number;
        };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Learning from star selection for email ${emailId}, starCount: ${starCount}`,
        );

        try {
          await this.priorityLearningService.learnFromStarSelection(
            userId,
            emailId,
            starCount,
          );
          this.logger.log(
            `[Worker ${workerId}] Completed learning for email ${emailId}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to learn from star selection for email ${emailId}`,
            error,
          );
          // Don't throw - learning failures shouldn't block other operations
        }
      },
    );

    this.logger.log("Priority learning processor initialized");
  }
}
