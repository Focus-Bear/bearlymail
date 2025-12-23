import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { EmailProviderManager } from "./email-provider-manager.service";
import { UsersService } from "../users/users.service";
import { GmailProvider } from "./providers/gmail.provider";
import { getJobPriority } from "../queue/job-priorities";

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
    const defaultSyncConcurrency = Math.max(3, Math.min(cpuCores, 6)); // 3-6 concurrent syncs
    const defaultScanConcurrency = Math.max(10, cpuCores * 3); // Scan can be highly parallel

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
    await this.boss.schedule("sync-all-users-urgent", "*/5 * * * *");

    // Worker for urgent syncs (every 5 minutes) - checks for new emails and updates status
    await this.boss.work("sync-all-users-urgent", async () => {
      this.logger.log("Starting urgent email sync for all users (5-minute check)");
      const users = await this.usersService.findAll();
      for (const user of users) {
        const provider = await this.emailProviderManager.getPrimaryProvider(
          user.id,
        );
        if (provider) {
          // Use singletonKey to prevent duplicate sync jobs per user
          await this.boss.send(
            "sync-emails",
            { userId: user.id },
            {
              priority: getJobPriority("sync-emails", false), // Scheduled sync = medium priority
              singletonKey: `sync-emails-${user.id}`,
              singletonMinutes: 5, // Don't allow another sync for same user within 5 minutes
            },
          );
        }
      }
    });

    // Worker for syncing individual user (generic, works with any provider)
    // Use CPU-based concurrency for parallel syncs
    // Add retry on failure - jobs will be retried automatically
    await this.boss.work(
      "sync-emails",
      {
        teamSize: this.syncConcurrency,
      } as any,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting background email sync for user ${userId}`,
        );
        try {
          await this.emailProviderManager.syncAllProviders(userId);
          this.logger.log(
            `[Worker ${workerId}] Completed background email sync for user ${userId}`,
          );
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
          throw error; // Re-throw to trigger pg-boss retry mechanism
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

    // Worker for historical scan - just queues individual email jobs
    await this.boss.work(
      "scan-history",
      { teamSize: this.syncConcurrency } as any,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
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
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to scan history for user ${userId}`,
            error,
          );
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
      { teamSize: this.scanConcurrency } as any,
      async (job) => {
        const { userId, messageId } = job.data as {
          userId: string;
          messageId: string;
        };
        const workerId = job.id || "unknown";
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
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to process email ${messageId} for user ${userId}`,
            error,
          );
          throw error;
        }
      },
    );
    this.logger.log("scan-history-email worker registered successfully");
  }
}
