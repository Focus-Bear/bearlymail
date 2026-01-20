import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { EmailProviderManager } from "./email-provider-manager.service";
import { UsersService } from "../users/users.service";
import { GmailProvider } from "./providers/gmail.provider";
import { getJobPriority } from "../queue/job-priorities";
import { DAYS } from "../constants/time-constants";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";

@Injectable()
export class EmailSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailSyncProcessor.name);
  private readonly syncConcurrency: number;
  private readonly scanConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly usersService: UsersService,
    private readonly gmailProvider: GmailProvider,
    private configService: ConfigService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For sync jobs (I/O bound), use more workers than CPU cores
    // 3-6 concurrent syncs
    const defaultSyncConcurrency = Math.max(3, Math.min(cpuCores, DAYS.SIX));
    // Scan can be highly parallel
    const defaultScanConcurrency = Math.max(10, cpuCores * 3);

    this.syncConcurrency = parseInt(
      this.configService.get<string>("JOB_SYNC_CONCURRENCY") ||
        String(defaultSyncConcurrency),
      10,
    );
    this.scanConcurrency = parseInt(
      this.configService.get<string>("JOB_SCAN_CONCURRENCY") ||
        String(defaultScanConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, sync concurrency: ${this.syncConcurrency}, scan concurrency: ${this.scanConcurrency}`,
    );
  }

  // eslint-disable-next-line max-lines-per-function
  async onModuleInit() {
    // Schedule recurring sync for all users every 5 minutes (for urgency checks and status updates)
    await this.boss.schedule("schedule-email-fetch-jobs", "*/5 * * * *");

    // Worker for scheduling email fetch jobs (every 5 minutes) - queues individual fetch-user-emails jobs for each user
    await this.boss.work("schedule-email-fetch-jobs", async (job) => {
      const workerId = job.id || "unknown";
      const tracker = new JobPerformanceTracker("schedule-email-fetch-jobs", workerId);

      this.logger.log(
        "Starting email fetch job scheduling (5-minute check)",
      );
      try {
        tracker.startPhase("fetchUsers");
        const users = await this.usersService.findAll();
        tracker.endPhase("fetchUsers");
        tracker.startPhase("queueJobs");

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        let jobsQueued = 0;
        let jobsSkipped = 0;

        for (const user of users) {
          try {
            // Check if user was synced recently - skip if within 5 minutes
            if (
              user.lastEmailSyncAt &&
              user.lastEmailSyncAt > fiveMinutesAgo
            ) {
              const secondsSinceSync = Math.round(
                (Date.now() - user.lastEmailSyncAt.getTime()) / 1000,
              );
              this.logger.debug(
                `Skipping user ${user.id} - last sync was ${secondsSinceSync}s ago (< 5 minutes)`,
              );
              jobsSkipped++;
              continue;
            }

            const provider = await this.emailProviderManager.getPrimaryProvider(
              user.id,
            );
            if (provider) {
              // Use singletonKey to prevent duplicate fetch jobs per user
              await this.boss.send(
                "fetch-user-emails",
                { userId: user.id },
                {
                  priority: getJobPriority("fetch-user-emails", false),
                  // Scheduled fetch = medium priority
                  singletonKey: `fetch-user-emails-${user.id}`,
                  // Don't allow another fetch for same user within 5 minutes
                  singletonMinutes: 5,
                },
              );
              jobsQueued++;
            }
          } catch (userError) {
            this.logger.error(
              `Error processing user ${user.id} for email fetch scheduling:`,
              userError,
            );
            // Continue with other users instead of failing entire job
          }
        }
        tracker.endPhase("queueJobs");
        tracker.finish();

        this.logger.log(
          `Scheduled ${jobsQueued} email fetch jobs, skipped ${jobsSkipped} users (recently synced)`,
        );
      } catch (error) {
        this.logger.error(
          `Error in schedule-email-fetch-jobs:`,
          error,
        );
        tracker.finish(error as Error);
        throw error;
      }
    });

    // Worker for fetching emails for individual user (generic, works with any provider)
    // Use CPU-based concurrency for parallel fetches
    // Add retry on failure - jobs will be retried automatically
    await this.boss.work(
      "fetch-user-emails",
      {
        teamSize: this.syncConcurrency,
      } as { teamSize: number },
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker("fetch-user-emails", workerId);
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Starting email fetch for user ${userId}`,
        );
        try {
          await this.emailProviderManager.syncAllProviders(userId);
          this.logger.log(
            `[Worker ${workerId}] Completed email fetch for user ${userId}`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to sync emails for user ${userId}`,
            error,
          );
          // Check if it's a connection error - don't retry those, pg-boss will handle reconnection
          if (
            error &&
            (error.message?.includes("Connection terminated") ||
              error.message?.includes("connection"))
          ) {
            this.logger.warn(
              `[Worker ${workerId}] Connection error detected, job will be retried after reconnection`,
            );
          }
          tracker.finish(error as Error);
          throw error;
          // Re-throw to trigger pg-boss retry mechanism
        }
      },
    );

    // Keep 'sync-gmail' for backwards compatibility, but route to new system
    await this.boss.work("sync-gmail", async (job) => {
      const { userId } = job.data as { userId: string };
      this.logger.debug(
        `Starting background email sync for user ${userId} (legacy route)`,
      );
      try {
        await this.emailProviderManager.syncAllProviders(userId);
        this.logger.debug(`Completed background email sync for user ${userId}`);
      } catch (error) {
        this.logger.error(`Failed to sync emails for user ${userId}`, error);
        throw error;
      }
    });

    // Handle legacy 'sync-all-users' jobs - ignore/delete them
    await this.boss.work("sync-all-users", async (job) => {
      this.logger.warn(
        `Legacy 'sync-all-users' job detected (id: ${job.id}). This job type is deprecated. Ignoring.`,
      );
      // Don't throw error - just complete the job to remove it from queue
      // The new 'schedule-email-fetch-jobs' job handles this functionality
    });

    // Handle legacy 'queue-user-syncs-urgent' jobs - route to new system
    await this.boss.work("queue-user-syncs-urgent", async (job) => {
      const workerId = job.id || "unknown";
      this.logger.warn(
        `Legacy 'queue-user-syncs-urgent' job detected (id: ${workerId}). This job type is deprecated. Ignoring.`,
      );
      // Don't throw error - just complete the job to remove it from queue
      // The new 'schedule-email-fetch-jobs' job handles this functionality
    });

    // Handle legacy 'sync-all-users-urgent' jobs - route to new system
    await this.boss.work("sync-all-users-urgent", async (job) => {
      const workerId = job.id || "unknown";
      this.logger.warn(
        `Legacy 'sync-all-users-urgent' job detected (id: ${workerId}). This job type is deprecated. Ignoring.`,
      );
      // Don't throw error - just complete the job to remove it from queue
      // The new 'schedule-email-fetch-jobs' job handles this functionality
    });

    // Worker for historical scan - just queues individual email jobs
    await this.boss.work(
      "scan-history",
      { teamSize: this.syncConcurrency },
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker("scan-history", workerId);
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Starting historical email scan for user ${userId}`,
        );
        try {
          const provider =
            await this.emailProviderManager.getPrimaryProvider(userId);
          if (provider) {
            await provider.scanHistory(userId);
            this.logger.log(
              `[Worker ${workerId}] Queued individual email scan jobs for user ${userId}`,
            );
          } else {
            this.logger.warn(
              `[Worker ${workerId}] No email provider connected for user ${userId}`,
            );
          }
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to scan history for user ${userId}`,
            error,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );

    // Worker for processing individual emails during scan - use CPU-based concurrency for fast parallel processing
    this.logger.log(
      `Registering scan-history-email worker with teamSize: ${this.scanConcurrency}`,
    );
    await this.boss.work(
      "scan-history-email",
      { teamSize: this.scanConcurrency },
      async (job) => {
        const { userId, messageId } = job.data as {
          userId: string;
          messageId: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker("scan-history-email", workerId);
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Processing email ${messageId} for user ${userId}`,
        );
        try {
          if (!this.gmailProvider) {
            this.logger.error(
              `[Worker ${workerId}] GmailProvider not available`,
            );
            throw new Error("GmailProvider not available");
          }
          await this.gmailProvider.processScanEmail(userId, messageId);
          this.logger.debug(
            `[Worker ${workerId}] Successfully processed email ${messageId}`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to process email ${messageId} for user ${userId}`,
            error,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
    this.logger.log("scan-history-email worker registered successfully");
  }
}
