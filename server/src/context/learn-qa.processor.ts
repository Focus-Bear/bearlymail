import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DAYS } from "../constants/time-constants";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { sanitizeAxiosError } from "../utils/axios-error.utils";
import { ContextEmailDataService } from "./context-gmail-data.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";

// How far back to look, and how many sent emails to sample, when learning Q&A
// from recent activity. Kept modest because this runs on a per-user debounce
// (at most once per window) triggered by real sends — enough history for the
// frequency signal to mean something without a large per-run LLM cost.
const QA_LOOKBACK_DAYS = DAYS.MONTH;
const QA_MAX_SENT_EMAILS = 40;

/**
 * Worker for the `learn-qa-from-sent` job. Enqueued (debounced per user) when a
 * user sends a reply, it batch-extracts common Q&A pairs from the user's recent
 * sent emails and stores them as UNAPPROVED for review — the continuous
 * counterpart to the one-shot extraction that runs during "Analyze Emails".
 */
@Injectable()
export class LearnQaProcessor implements OnModuleInit {
  private readonly logger = new Logger(LearnQaProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private usersService: UsersService,
    private emailProviderManager: EmailProviderManager,
    private contextEmailDataService: ContextEmailDataService,
    private qaExtractionService: ContextQaExtractionService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker(this.boss, JOB_NAMES.LEARN_QA_FROM_SENT, (job) => {
      const { userId } = (job.data as { userId?: string }) || {};
      if (!userId) return Promise.resolve();
      return this.learnForUser(userId, job.id || "unknown");
    });
    this.logger.log("Q&A learning processor registered");
  }

  private async learnForUser(userId: string, workerId: string): Promise<void> {
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.LEARN_QA_FROM_SENT,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId });

    try {
      // Reads per-user-encrypted OAuth tokens, sent email bodies, and existing
      // UserContext Q&A rows, and writes new ones — all require the user's key.
      await this.userEncryptionService.withUserKey(userId, () =>
        this.extractRecentQAndA(userId),
      );
      tracker.finish();
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Q&A learning failed for user ${userId}: ${sanitizeAxiosError(error)}`,
      );
      tracker.finish(error as Error);
      // Swallow: this is best-effort background learning, not worth a retry
      // storm. The next reply-send re-enqueues it.
    }
  }

  private async extractRecentQAndA(userId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    const userEmail = user?.email;
    if (!userEmail) return;

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) return;

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - QA_LOOKBACK_DAYS);

    const sentEmails =
      await this.contextEmailDataService.fetchSentThreadsFromProvider(
        userId,
        userEmail,
        lookbackStart,
        new Date(),
        QA_MAX_SENT_EMAILS,
      );
    if (sentEmails.length === 0) return;

    await this.qaExtractionService.extractQAndAFromSentEmails(
      userId,
      sentEmails,
    );
  }
}
