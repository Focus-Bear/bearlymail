import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { LessThanOrEqual, Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";

@Injectable()
export class SnoozeProcessor implements OnModuleInit {
  private readonly logger = new Logger(SnoozeProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private emailProviderManager: EmailProviderManager,
    private cloudWatchService: CloudWatchService,
    private userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await this.boss.schedule(JOB_NAMES.CHECK_EXPIRED_SNOOZES, "* * * * *");
    await this.registerSnoozeCheckWorker();
    await this.registerUnsnoozeThreadWorker();
    this.logger.log("Snooze processor initialized - checking every minute");
  }

  private async registerSnoozeCheckWorker() {
    await registerWorker(
      this.boss,
      JOB_NAMES.CHECK_EXPIRED_SNOOZES,
      async (job) => {
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.CHECK_EXPIRED_SNOOZES,
          workerId,
          this.cloudWatchService,
        );

        this.logger.log("[Snooze] Starting expired snooze check");
        try {
          tracker.startPhase("findExpiredSnoozes");
          const now = new Date();

          // Select only the plaintext columns the handler needs. This cron runs
          // across ALL users with no per-user key context, so hydrating the full
          // entity would decrypt per-user-encrypted columns (urgencyExplanation,
          // priorityExplanation, category, githubMetadata, …) with the global-key
          // fallback and throw "FATAL: N consecutive decryption failures",
          // failing the job every minute. The loop below only reads userId and
          // threadId. See issue #2216.
          const expiredThreads = await this.emailThreadRepository.find({
            where: {
              isSnoozed: true,
              snoozeUntil: LessThanOrEqual(now),
            },
            select: { id: true, userId: true, threadId: true },
          });

          tracker.endPhase("findExpiredSnoozes");
          tracker.startPhase("queueUnsnoozeJobs");

          this.logger.log(
            `[Snooze] Found ${expiredThreads.length} expired snoozed threads`,
          );

          let jobsQueued = 0;
          for (const thread of expiredThreads) {
            try {
              await this.boss.send(
                JOB_NAMES.UNSNOOZE_THREAD,
                { userId: thread.userId, threadId: thread.threadId },
                {
                  priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, false),
                  singletonKey: `unsnooze-thread-${thread.threadId}`,
                  singletonSeconds: SECONDS.FIVE_MINUTES,
                },
              );
              jobsQueued++;
            } catch (queueError) {
              this.logger.error(
                `[Snooze] Error queueing unsnooze job for thread ${thread.threadId}:`,
                queueError,
              );
            }
          }

          tracker.endPhase("queueUnsnoozeJobs");
          tracker.finish();

          this.logger.log(
            `[Snooze] Queued ${jobsQueued} unsnooze jobs for expired snoozes`,
          );
        } catch (error) {
          this.logger.error("[Snooze] Error in check-expired-snoozes:", error);
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }

  private async registerUnsnoozeThreadWorker() {
    await registerWorker(
      this.boss,
      JOB_NAMES.UNSNOOZE_THREAD,
      { teamSize: 3 },
      async (job) => {
        const { userId, threadId } = job.data as {
          userId: string;
          threadId: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.UNSNOOZE_THREAD,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId, threadId });

        this.logger.log(
          `[Worker ${workerId}] Starting unsnooze for thread ${threadId}`,
        );

        try {
          tracker.startPhase("unsnoozeInProvider");

          // getPrimaryProvider → isConnected reads per-user-encrypted OAuth
          // account rows (email, access/refresh tokens); like every PgBoss
          // handler touching encrypted entities, it needs the user's key.
          await this.userEncryptionService.withUserKey(userId, async () => {
            const provider =
              await this.emailProviderManager.getPrimaryProvider(userId);
            if (provider) {
              await provider.unsnoozeThread(userId, threadId);
              this.logger.log(
                `[Worker ${workerId}] Successfully unsnoozed thread ${threadId} in provider`,
              );
            } else {
              this.logger.warn(
                `[Worker ${workerId}] No email provider connected for user ${userId}`,
              );
            }
          });

          tracker.endPhase("unsnoozeInProvider");
          tracker.startPhase("updateDatabase");

          await this.emailThreadRepository.update(
            { userId, threadId },
            { isSnoozed: false, snoozeUntil: null },
          );

          await this.emailRepository.update(
            { userId, threadId },
            { isSnoozed: false, snoozeUntil: null },
          );

          tracker.endPhase("updateDatabase");
          tracker.finish();

          this.logger.log(
            `[Worker ${workerId}] Completed unsnooze for thread ${threadId}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to unsnooze thread ${threadId}:`,
            error,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }
}
