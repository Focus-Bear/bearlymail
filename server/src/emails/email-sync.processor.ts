import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import {
  DAYS,
  HOURS,
  MILLISECONDS,
  MS_PER_SECOND,
  SECONDS,
} from "../constants/time-constants";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { sanitizeAxiosError } from "../utils/axios-error.utils";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";

@Injectable()
export class EmailSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailSyncProcessor.name);
  private readonly syncConcurrency: number;
  private readonly scanConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly usersService: UsersService,
    private readonly gmailProvider: GmailProvider,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
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

  async onModuleInit() {
    // Schedule recurring sync for all users every 5 minutes (for urgency checks and status updates)
    await this.boss.schedule(
      JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS,
      "*/5 * * * *",
    );

    // Schedule extended sync (full ongoing sync window) every 2 hours to catch any missed emails
    await this.boss.schedule(
      JOB_NAMES.SCHEDULE_EXTENDED_EMAIL_FETCH_JOBS,
      "0 */2 * * *",
    );

    // Schedule inbox status verification every 2 hours to detect Gmail-archived emails
    await this.boss.schedule(
      JOB_NAMES.SCHEDULE_VERIFY_INBOX_STATUS,
      "30 */2 * * *",
    );

    await this.registerFetchSchedulerWorker();
    await this.registerFetchUserEmailsWorker();
    await this.registerExtendedFetchSchedulerWorker();
    await this.registerExtendedFetchWorker();
    await this.registerVerifyInboxStatusScheduler();
    await this.registerVerifyInboxStatusWorker();
    await this.registerLegacyWorkers();
    await this.registerScanHistoryWorker();
    await this.registerScanHistoryEmailWorker();
  }

  // Worker for scheduling email fetch jobs (every 5 minutes) - queues individual fetch-user-emails jobs for each user
  private async registerFetchSchedulerWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS,
      async (job) => {
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS,
          workerId,
          this.cloudWatchService,
        );

        this.logger.log("Starting email fetch job scheduling (5-minute check)");
        try {
          tracker.startPhase("fetchUsers");
          const users = await this.usersService.findAll();
          tracker.endPhase("fetchUsers");
          tracker.startPhase("queueJobs");

          const fiveMinutesAgo = new Date(Date.now() - 5 * MILLISECONDS.MINUTE);
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
                  (Date.now() - user.lastEmailSyncAt.getTime()) / MS_PER_SECOND,
                );
                this.logger.debug(
                  `Skipping user ${user.id} - last sync was ${secondsSinceSync}s ago (< 5 minutes)`,
                );
                jobsSkipped++;
                continue;
              }

              const provider =
                await this.emailProviderManager.getPrimaryProvider(user.id);
              if (provider) {
                // Use singletonKey to prevent duplicate fetch jobs per user
                await this.boss.send(
                  JOB_NAMES.FETCH_USER_EMAILS,
                  { userId: user.id },
                  {
                    priority: getJobPriority(
                      JOB_NAMES.FETCH_USER_EMAILS,
                      false,
                    ),
                    // Scheduled fetch = medium priority
                    singletonKey: `fetch-user-emails-${user.id}`,
                    // Don't allow another fetch for same user within 5 minutes
                    singletonSeconds: SECONDS.FIVE_MINUTES,
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
            `Error in schedule-email-fetch-jobs: ${sanitizeAxiosError(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }

  private async registerFetchUserEmailsWorker(): Promise<void> {
    // Use CPU-based concurrency for parallel fetches
    // Add retry on failure - jobs will be retried automatically
    // Supports continuation jobs with threadIds for processing large mailboxes in chunks
    await registerWorker(
      this.boss,
      JOB_NAMES.FETCH_USER_EMAILS,
      {
        teamSize: this.syncConcurrency,
      } as { teamSize: number },
      async (job) => {
        const { userId, threadIds, isContinuation, syncWindowHours } =
          job.data as {
            userId: string;
            threadIds?: string[];
            isContinuation?: boolean;
            syncWindowHours?: number;
          };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.FETCH_USER_EMAILS,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({
          userId,
          isContinuation: isContinuation || false,
          threadCount: threadIds?.length,
        });

        const continuationLabel = isContinuation ? " (continuation)" : "";
        this.logger.log(
          `[Worker ${workerId}] Starting email fetch${continuationLabel} for user ${userId}${threadIds ? ` (${threadIds.length} threads)` : ""}`,
        );
        await this.userEncryptionService.withUserKey(userId, async () => {
          try {
            // If this is a continuation job with specific thread IDs, pass them to the provider
            if (threadIds && threadIds.length > 0) {
              // For continuation jobs, call Gmail provider directly with thread IDs
              await this.gmailProvider.syncEmails(userId, {
                threadIds,
                isContinuation: true,
                syncWindowHours,
              });
            } else {
              // Normal sync - use provider manager for all connected providers
              await this.emailProviderManager.syncAllProviders(
                userId,
                syncWindowHours,
              );
            }
            this.logger.log(
              `[Worker ${workerId}] Completed email fetch${continuationLabel} for user ${userId}`,
            );
            tracker.finish();
          } catch (error) {
            this.logger.error(
              `[Worker ${workerId}] Failed to sync emails${continuationLabel} for user ${userId}`,
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
        });
      },
    );
  }

  // Worker for scheduling extended email fetch jobs (every 2 hours) - fetches ALL inbox emails (no date filter)
  private async registerExtendedFetchSchedulerWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_EXTENDED_EMAIL_FETCH_JOBS,
      async (job) => {
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.SCHEDULE_EXTENDED_EMAIL_FETCH_JOBS,
          workerId,
          this.cloudWatchService,
        );

        this.logger.log(
          "Starting extended email fetch job scheduling (full ongoing sync window)",
        );
        try {
          tracker.startPhase("fetchUsers");
          const users = await this.usersService.findAll();
          tracker.endPhase("fetchUsers");
          tracker.startPhase("queueJobs");

          let jobsQueued = 0;

          for (const user of users) {
            try {
              const provider =
                await this.emailProviderManager.getPrimaryProvider(user.id);
              if (provider) {
                // Use singletonKey to prevent duplicate extended fetch jobs per user
                // noDateFilter: true fetches the full ongoing sync window
                // (clamped by sync-window-policy.ts) instead of the
                // incremental window
                await this.boss.send(
                  JOB_NAMES.FETCH_USER_EMAILS_EXTENDED,
                  { userId: user.id, noDateFilter: true },
                  {
                    priority: getJobPriority(
                      JOB_NAMES.FETCH_USER_EMAILS,
                      false,
                    ),
                    singletonKey: `fetch-user-emails-extended-${user.id}`,
                    // Don't allow another extended fetch for same user within 2 hours
                    singletonSeconds: SECONDS.TWO_HOURS,
                  },
                );
                jobsQueued++;
              }
            } catch (userError) {
              this.logger.error(
                `Error processing user ${user.id} for extended email fetch scheduling:`,
                userError,
              );
            }
          }
          tracker.endPhase("queueJobs");
          tracker.finish();

          this.logger.log(
            `Scheduled ${jobsQueued} extended email fetch jobs (full ongoing sync window)`,
          );
        } catch (error) {
          this.logger.error(
            `Error in schedule-extended-email-fetch-jobs:`,
            error,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }

  // Worker for extended email fetch (full inbox, no date filter)
  private async registerExtendedFetchWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.FETCH_USER_EMAILS_EXTENDED,
      {
        teamSize: this.syncConcurrency,
      } as { teamSize: number },
      async (job) => {
        const { userId, noDateFilter, syncWindowHours } = job.data as {
          userId: string;
          noDateFilter?: boolean;
          // kept for backwards-compat with any in-flight jobs
          syncWindowHours?: number;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.FETCH_USER_EMAILS_EXTENDED,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Starting extended email fetch (${noDateFilter ? "full sync window" : `${syncWindowHours ?? HOURS.TWO_DAYS}h`}) for user ${userId}`,
        );
        await this.userEncryptionService.withUserKey(userId, async () => {
          try {
            if (noDateFilter) {
              await this.emailProviderManager.syncAllProviders(userId, {
                noDateFilter: true,
              });
            } else {
              // Backwards compat: old jobs may still carry syncWindowHours
              await this.emailProviderManager.syncAllProviders(
                userId,
                syncWindowHours ?? HOURS.TWO_DAYS,
              );
            }
            this.logger.log(
              `[Worker ${workerId}] Completed extended email fetch for user ${userId}`,
            );
            tracker.finish();
          } catch (error) {
            this.logger.error(
              `[Worker ${workerId}] Failed to sync emails (extended) for user ${userId}`,
              error,
            );
            tracker.finish(error as Error);
            throw error;
          }
        });
      },
    );
  }

  // Worker for scheduling inbox status verification (every 2 hours)
  // Queues individual verify-user-inbox-status jobs per user
  private async registerVerifyInboxStatusScheduler(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_VERIFY_INBOX_STATUS,
      async (job) => {
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.SCHEDULE_VERIFY_INBOX_STATUS,
          workerId,
          this.cloudWatchService,
        );

        this.logger.log(
          "Starting inbox status verification scheduling (2-hour check)",
        );
        try {
          tracker.startPhase("fetchUsers");
          const users = await this.usersService.findAll();
          tracker.endPhase("fetchUsers");
          tracker.startPhase("queueJobs");

          let jobsQueued = 0;

          for (const user of users) {
            try {
              const provider =
                await this.emailProviderManager.getPrimaryProvider(user.id);
              if (provider) {
                await this.boss.send(
                  JOB_NAMES.VERIFY_USER_INBOX_STATUS,
                  { userId: user.id },
                  {
                    priority: getJobPriority(
                      JOB_NAMES.FETCH_USER_EMAILS,
                      false,
                    ),
                    singletonKey: `verify-user-inbox-status-${user.id}`,
                    singletonSeconds: SECONDS.TWO_HOURS,
                  },
                );
                jobsQueued++;
              }
            } catch (userError) {
              this.logger.error(
                `Error scheduling inbox status check for user ${user.id}: ${sanitizeAxiosError(userError)}`,
              );
            }
          }
          tracker.endPhase("queueJobs");
          tracker.finish();

          this.logger.log(
            `Scheduled ${jobsQueued} inbox status verification jobs`,
          );
        } catch (error) {
          this.logger.error(
            `Error in schedule-verify-inbox-status: ${sanitizeAxiosError(error)}`,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }

  // Worker for verifying inbox status per user - checks all non-archived BearlyMail threads
  // against Gmail and archives any that have been archived in Gmail
  private async registerVerifyInboxStatusWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.VERIFY_USER_INBOX_STATUS,
      { teamSize: this.syncConcurrency } as { teamSize: number },
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.VERIFY_USER_INBOX_STATUS,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Starting inbox status verification for user ${userId}`,
        );
        await this.userEncryptionService.withUserKey(userId, async () => {
          try {
            await this.gmailProvider.verifyInboxStatus(userId);
            this.logger.log(
              `[Worker ${workerId}] Completed inbox status verification for user ${userId}`,
            );
            tracker.finish();
          } catch (error) {
            this.logger.error(
              `[Worker ${workerId}] Failed inbox status verification for user ${userId}`,
              error,
            );
            tracker.finish(error as Error);
            throw error;
          }
        });
      },
    );
  }

  // Legacy and deprecated job handlers
  private async registerLegacyWorkers(): Promise<void> {
    // Keep 'sync-gmail' for backwards compatibility, but route to new system
    await registerWorker(this.boss, JOB_NAMES.SYNC_GMAIL, async (job) => {
      const { userId } = job.data as { userId: string };
      this.logger.debug(
        `Starting background email sync for user ${userId} (legacy route)`,
      );
      try {
        await this.emailProviderManager.syncAllProviders(userId);
        this.logger.debug(`Completed background email sync for user ${userId}`);
      } catch (error) {
        this.logger.error(
          `Failed to sync emails for user ${userId}: ${sanitizeAxiosError(error)}`,
        );
        throw error;
      }
    });

    // Handle legacy 'sync-all-users' jobs - ignore/delete them
    await registerWorker(this.boss, JOB_NAMES.SYNC_ALL_USERS, async (job) => {
      this.logger.warn(
        `Legacy 'sync-all-users' job detected (id: ${job.id}). This job type is deprecated. Ignoring.`,
      );
      // Don't throw error - just complete the job to remove it from queue
      // The new 'schedule-email-fetch-jobs' job handles this functionality
    });

    // Handle legacy 'queue-user-syncs-urgent' jobs - route to new system
    await registerWorker(
      this.boss,
      JOB_NAMES.QUEUE_USER_SYNCS_URGENT,
      async (job) => {
        const workerId = job.id || "unknown";
        this.logger.warn(
          `Legacy 'queue-user-syncs-urgent' job detected (id: ${workerId}). This job type is deprecated. Ignoring.`,
        );
        // Don't throw error - just complete the job to remove it from queue
        // The new 'schedule-email-fetch-jobs' job handles this functionality
      },
    );

    // Handle legacy 'sync-all-users-urgent' jobs - route to new system
    await registerWorker(
      this.boss,
      JOB_NAMES.SYNC_ALL_USERS_URGENT,
      async (job) => {
        const workerId = job.id || "unknown";
        this.logger.warn(
          `Legacy 'sync-all-users-urgent' job detected (id: ${workerId}). This job type is deprecated. Ignoring.`,
        );
        // Don't throw error - just complete the job to remove it from queue
        // The new 'schedule-email-fetch-jobs' job handles this functionality
      },
    );
  }

  // Worker for historical scan - just queues individual email jobs
  private async registerScanHistoryWorker(): Promise<void> {
    await registerWorker(
      this.boss,
      JOB_NAMES.SCAN_HISTORY,
      { teamSize: this.syncConcurrency },
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.SCAN_HISTORY,
          workerId,
          this.cloudWatchService,
        );
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
  }

  // Worker for processing individual emails during scan - use CPU-based concurrency for fast parallel processing
  private async registerScanHistoryEmailWorker(): Promise<void> {
    this.logger.log(
      `Registering scan-history-email worker with teamSize: ${this.scanConcurrency}`,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.SCAN_HISTORY_EMAIL,
      { teamSize: this.scanConcurrency },
      async (job) => {
        const { userId, messageId } = job.data as {
          userId: string;
          messageId: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.SCAN_HISTORY_EMAIL,
          workerId,
          this.cloudWatchService,
        );
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
