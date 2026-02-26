import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PgBoss from "pg-boss";
import { UsersService } from "../users/users.service";
import { WritingStyleLearningService } from "./writing-style-learning.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { ContextEmailDataService } from "./context-gmail-data.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";

// Check for learning opportunities every 30 minutes
const LEARNING_CHECK_CRON = "*/30 * * * *";

@Injectable()
export class WritingStyleLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(WritingStyleLearningProcessor.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private usersService: UsersService,
    private writingStyleLearningService: WritingStyleLearningService,
    private emailProviderManager: EmailProviderManager,
    private contextEmailDataService: ContextEmailDataService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
  ) {}

  async onModuleInit() {
    // Schedule periodic check for writing style learning
    await this.boss.schedule(
      "check-writing-style-learning",
      LEARNING_CHECK_CRON,
    );

    await this.boss.work("check-writing-style-learning", (job) =>
      this.runWritingStyleLearningCheck(job.id || "unknown"),
    );

    this.logger.log("Writing style learning processor registered");
  }

  private async runWritingStyleLearningCheck(workerId: string): Promise<void> {
    const tracker = new JobPerformanceTracker(
      "check-writing-style-learning",
      workerId,
      this.cloudWatchService,
    );
    this.logger.log(
      `[Worker ${workerId}] Starting writing style learning check`,
    );

    try {
      tracker.startPhase("fetchUsers");
      const users = await this.usersService.findAll();
      tracker.endPhase("fetchUsers");

      let usersProcessed = 0;
      let usersSkipped = 0;

      for (const user of users) {
        try {
          const { processed, skipped } = await this.processUserWritingStyle(
            user.id,
            user.email || "",
          );
          usersProcessed += processed;
          usersSkipped += skipped;
        } catch (userError) {
          this.logger.error(
            `Error processing writing style learning for user ${user.id}:`,
            userError,
          );
        }
      }

      tracker.finish();
      this.logger.log(
        `[Worker ${workerId}] Writing style learning check complete. Processed: ${usersProcessed}, Skipped: ${usersSkipped}`,
      );
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Writing style learning check failed:`,
        error,
      );
      tracker.finish(error as Error);
      throw error;
    }
  }

  private async processUserWritingStyle(
    userId: string,
    userEmail: string,
  ): Promise<{ processed: number; skipped: number }> {
    const exampleCount =
      await this.writingStyleLearningService.getExampleCount(userId);
    if (exampleCount >= QUERY_LIMITS.WRITING_STYLE_SAMPLE)
      return { processed: 0, skipped: 1 };

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider || !userEmail) return { processed: 0, skipped: 1 };

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);

    try {
      const sentEmails =
        await this.contextEmailDataService.fetchSentThreadsFromProvider(
          userId,
          userEmail,
          sevenDaysAgo,
          new Date(),
          10,
        );
      if (sentEmails.length > 0) {
        await this.writingStyleLearningService.learnFromSentEmailBodies(
          userId,
          sentEmails.map((e) => e.body),
        );
        return { processed: 1, skipped: 0 };
      }
      return { processed: 0, skipped: 1 };
    } catch (fetchError) {
      this.logger.warn(
        `Failed to fetch sent emails for user ${userId}:`,
        fetchError,
      );
      return { processed: 0, skipped: 1 };
    }
  }
}
