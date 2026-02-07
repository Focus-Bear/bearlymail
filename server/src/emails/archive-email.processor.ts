import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import PgBoss = require("pg-boss");
import { EmailsService } from "./emails.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { logErrorToFile } from "../utils/error-logger";

@Injectable()
export class ArchiveEmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(ArchiveEmailProcessor.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
  ) {}

  async onModuleInit() {
    // Register worker for archive-email jobs (legacy: does DB + provider sync)
    await this.boss.work("archive-email", async (job) => {
      const { userId, emailId } = job.data as {
        userId: string;
        emailId: string;
      };

      this.logger.log(
        `[Archive Job] Processing archive job: userId=${userId}, emailId=${emailId}`,
      );

      try {
        await this.emailsService.archiveEmail(userId, emailId);
        this.logger.log(
          `[Archive Job] Successfully archived email: userId=${userId}, emailId=${emailId}`,
        );
      } catch (error: unknown) {
        this.logger.error(
          `[Archive Job] Failed to archive email: userId=${userId}, emailId=${emailId}`,
          error,
        );
        logErrorToFile(
          `Failed to archive email in background job (userId: ${userId}, emailId: ${emailId})`,
          error,
          "ArchiveEmailProcessor",
        );
        throw error;
      }
    });

    // Register worker for provider-only sync jobs (DB update already done)
    await this.boss.work("archive-email-provider-sync", async (job) => {
      const { userId, threadId } = job.data as {
        userId: string;
        threadId: string;
      };

      this.logger.log(
        `[Archive Provider Sync] Processing: userId=${userId}, threadId=${threadId}`,
      );

      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "archiveThread" in provider) {
          await provider.archiveThread(userId, threadId);
          this.logger.log(
            `[Archive Provider Sync] Completed: userId=${userId}, threadId=${threadId}`,
          );
        } else {
          this.logger.warn(
            `[Archive Provider Sync] No provider available: userId=${userId}`,
          );
        }
      } catch (error: unknown) {
        this.logger.error(
          `[Archive Provider Sync] Failed: userId=${userId}, threadId=${threadId}`,
          error,
        );
        logErrorToFile(
          `Failed to sync archive to provider (userId: ${userId}, threadId: ${threadId})`,
          error,
          "ArchiveEmailProcessor",
        );
        throw error;
      }
    });

    this.logger.log(
      "ArchiveEmailProcessor initialized - archive-email and archive-email-provider-sync handlers registered",
    );
  }
}
