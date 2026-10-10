import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS, MILLISECONDS } from "../constants/time-constants";
import type { User } from "../database/entities/user.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
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

// Gradual backfill of writing-style examples from HISTORICAL sent mail (the
// cron above only watches new sent mail). Seeded by context discovery, each
// run scans one window further back, then re-queues itself after a pause, so
// a new user's voice is learned over roughly a day instead of on the
// onboarding critical path.
const BACKFILL_WINDOW_DAYS = DAYS.WEEK;
const BACKFILL_LOOKBACK_DAYS = DAYS.NINETY;
const BACKFILL_EMAILS_PER_RUN = 10;
const BACKFILL_RUN_INTERVAL_MS = 2 * MILLISECONDS.HOUR;

interface WritingStyleBackfillJob {
  userId: string;
  /** ISO upper bound of the next window to scan; omitted on the seed job. */
  before?: string;
}

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

    await registerWorker(
      this.boss,
      JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT,
      (job) =>
        this.runWritingStyleBackfill(
          job.data as WritingStyleBackfillJob,
          job.id || "unknown",
        ),
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

  /**
   * One step of the per-user backfill: learn from up to BACKFILL_EMAILS_PER_RUN
   * sent emails in the window ending at `before`, then re-queue the next window
   * unless the example target is met or the lookback is exhausted. Idempotent
   * — every run re-checks the example count, and the learning service dedups
   * snippets before spending an LLM call.
   */
  private async runWritingStyleBackfill(
    jobData: WritingStyleBackfillJob,
    workerId: string,
  ): Promise<void> {
    const { userId } = jobData;
    if (!userId) return;
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId });

    try {
      const nextBefore = await this.userEncryptionService.withUserKey(
        userId,
        () => this.backfillOneWindow(userId, jobData.before),
      );
      if (nextBefore) {
        await this.queueNextBackfillWindow(userId, nextBefore);
      }
      tracker.finish();
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Writing style backfill failed for user ${userId}: ${sanitizeAxiosError(error)}`,
      );
      tracker.finish(error as Error);
      // Best-effort background learning: the 6-hourly cron still learns from
      // new sent mail, and the next "Analyze" re-seeds the backfill.
    }
  }

  /** Returns the `before` bound for the next window, or null when done. */
  private async backfillOneWindow(
    userId: string,
    beforeIso: string | undefined,
  ): Promise<Date | null> {
    const exampleCount =
      await this.writingStyleLearningService.getExampleCount(userId);
    if (exampleCount >= QUERY_LIMITS.WRITING_STYLE_SAMPLE) return null;

    const user = await this.usersService.findOne(userId);
    const userEmail = user?.email || "";
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider || !userEmail) return null;

    const before = beforeIso ? new Date(beforeIso) : new Date();
    const lookbackStart = new Date(
      Date.now() - BACKFILL_LOOKBACK_DAYS * MILLISECONDS.DAY,
    );
    const windowStart = new Date(
      Math.max(
        before.getTime() - BACKFILL_WINDOW_DAYS * MILLISECONDS.DAY,
        lookbackStart.getTime(),
      ),
    );
    if (windowStart >= before) return null;

    const sentEmails =
      await this.contextEmailDataService.fetchSentThreadsFromProvider(
        userId,
        userEmail,
        windowStart,
        before,
        BACKFILL_EMAILS_PER_RUN,
      );
    if (sentEmails.length > 0) {
      await this.writingStyleLearningService.learnFromSentEmailBodies(
        userId,
        sentEmails.map((emailEntry) => emailEntry.body),
      );
    }
    this.logger.log(
      `Writing style backfill for user ${userId}: scanned ${sentEmails.length} sent emails in window ending ${before.toISOString()}`,
    );

    const updatedCount =
      await this.writingStyleLearningService.getExampleCount(userId);
    const exhausted = windowStart.getTime() <= lookbackStart.getTime();
    return updatedCount >= QUERY_LIMITS.WRITING_STYLE_SAMPLE || exhausted
      ? null
      : windowStart;
  }

  private async queueNextBackfillWindow(
    userId: string,
    before: Date,
  ): Promise<void> {
    const jobData: WritingStyleBackfillJob = {
      userId,
      before: before.toISOString(),
    };
    await this.boss.send(JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT, jobData, {
      priority: getJobPriority(JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT),
      // Keyed by window so a duplicate continuation is dropped while the
      // chain itself can advance past the (still active) current job.
      singletonKey: `learn-writing-style-${userId}-${before.getTime()}`,
      startAfter: new Date(Date.now() + BACKFILL_RUN_INTERVAL_MS),
    });
  }
}
