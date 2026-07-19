import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";
import type { User } from "../database/entities/user.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { sanitizeAxiosError } from "../utils/axios-error.utils";
import { ContextEmailDataService } from "./context-gmail-data.service";
import { WritingStyleLearningService } from "./writing-style-learning.service";

// Check for learning opportunities every 6 hours. Writing style changes
// slowly, and each check runs an LLM validation call per user with newly sent
// emails — at 30-minute cadence this was ~2.1K Gemini calls/week, dominating
// LLM spend for no user-visible benefit.
const LEARNING_CHECK_CRON = "0 */6 * * *";

@Injectable()
export class WritingStyleLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(WritingStyleLearningProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private usersService: UsersService,
    private writingStyleLearningService: WritingStyleLearningService,
    private emailProviderManager: EmailProviderManager,
    private contextEmailDataService: ContextEmailDataService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    // Schedule periodic check for writing style learning
    await this.boss.schedule(
      JOB_NAMES.CHECK_WRITING_STYLE_LEARNING,
      LEARNING_CHECK_CRON,
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.CHECK_WRITING_STYLE_LEARNING,
      (job) => this.runWritingStyleLearningCheck(job.id || "unknown"),
    );

    this.logger.log("Writing style learning processor registered");
  }

  private async runWritingStyleLearningCheck(workerId: string): Promise<void> {
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.CHECK_WRITING_STYLE_LEARNING,
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
          // processUserWritingStyle reads encrypted OAuth tokens (provider
          // lookup), encrypted Email bodies from sent-thread fetch, and
          // writes encrypted toneSettings/UserContext examples. Wrap with
          // the user's KMS key so all of those use the per-user envelope.
          const { processed, skipped } =
            await this.userEncryptionService.withUserKey(user.id, () =>
              this.processUserWritingStyle(user),
            );
          usersProcessed += processed;
          usersSkipped += skipped;
        } catch (userError) {
          this.logger.error(
            `Error processing writing style learning for user ${user.id}: ${sanitizeAxiosError(userError)}`,
            userError instanceof Error ? userError.stack : undefined,
          );
        }
      }

      tracker.finish();
      this.logger.log(
        `[Worker ${workerId}] Writing style learning check complete. Processed: ${usersProcessed}, Skipped: ${usersSkipped}`,
      );
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Writing style learning check failed: ${sanitizeAxiosError(error)}`,
      );
      tracker.finish(error as Error);
      throw error;
    }
  }

  private async processUserWritingStyle(
    user: User,
  ): Promise<{ processed: number; skipped: number }> {
    const userId = user.id;
    const userEmail = user.email || "";
    const exampleCount =
      await this.writingStyleLearningService.getExampleCount(userId);
    if (exampleCount >= QUERY_LIMITS.WRITING_STYLE_SAMPLE)
      return { processed: 0, skipped: 1 };

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider || !userEmail) return { processed: 0, skipped: 1 };

    // Only fetch sent mail we haven't scanned before: the watermark caps the
    // window's lower bound so each sent email is LLM-validated at most once,
    // instead of re-validating the same rolling 7-day window every run.
    const fetchEnd = new Date();
    const sevenDaysAgo = new Date(fetchEnd);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
    const watermark = user.writingStyleCheckedUpTo;
    const fetchStart =
      watermark && watermark > sevenDaysAgo ? watermark : sevenDaysAgo;
    if (fetchStart >= fetchEnd) return { processed: 0, skipped: 1 };

    try {
      const sentEmails =
        await this.contextEmailDataService.fetchSentThreadsFromProvider(
          userId,
          userEmail,
          fetchStart,
          fetchEnd,
          10,
        );
      if (sentEmails.length > 0) {
        await this.writingStyleLearningService.learnFromSentEmailBodies(
          userId,
          sentEmails.map((emailEntry) => emailEntry.body),
        );
      }
      // Advance the watermark even when the window held no sent mail — it has
      // been scanned either way. On fetch failure we leave it untouched so the
      // window is retried next run.
      await this.usersService.update(userId, {
        writingStyleCheckedUpTo: fetchEnd,
      });
      return sentEmails.length > 0
        ? { processed: 1, skipped: 0 }
        : { processed: 0, skipped: 1 };
    } catch (fetchError) {
      this.logger.warn(
        `Failed to fetch sent emails for user ${userId}: ${sanitizeAxiosError(fetchError)}`,
      );
      return { processed: 0, skipped: 1 };
    }
  }
}
