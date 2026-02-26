import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import PgBoss from "pg-boss";
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
      const { userId, emailId, isBlocked } = job.data as {
        userId: string;
        emailId: string;
        isBlocked?: boolean;
      };

      this.logger.log(
        `[Archive Job] Processing archive job: userId=${userId}, emailId=${emailId}, isBlocked=${!!isBlocked}`,
      );

      try {
        await this.emailsService.archiveEmail(userId, emailId);
        this.logger.log(
          `[Archive Job] Successfully archived email: userId=${userId}, emailId=${emailId}`,
        );

        if (isBlocked) {
          try {
            const email = await this.emailsService.getEmailById(
              userId,
              emailId,
            );
            if (email?.threadId) {
              const provider =
                await this.emailProviderManager.getPrimaryProvider(userId);
              if (provider && "addLabelToThread" in provider) {
                await provider.addLabelToThread(
                  userId,
                  email.threadId,
                  "BearlyMail-Blocked",
                );
                this.logger.log(
                  `[Archive Job] Added BearlyMail-Blocked label: userId=${userId}, threadId=${email.threadId}`,
                );
              }
            }
          } catch (labelError: unknown) {
            this.logger.error(
              `[Archive Job] Failed to add BearlyMail-Blocked label: userId=${userId}, emailId=${emailId}`,
              labelError,
            );
          }
        }
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
      const { userId, threadId, wasStarred } = job.data as {
        userId: string;
        threadId: string;
        wasStarred?: boolean;
      };

      this.logger.log(
        `[Archive Provider Sync] Processing: userId=${userId}, threadId=${threadId}, wasStarred=${!!wasStarred}`,
      );

      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "archiveThread" in provider) {
          await provider.archiveThread(userId, threadId);
          this.logger.log(
            `[Archive Provider Sync] Archived thread: userId=${userId}, threadId=${threadId}`,
          );

          // If the thread was starred, also remove the star in Gmail
          if (wasStarred && "syncStarStatusToGmail" in provider) {
            try {
              await provider.syncStarStatusToGmail(userId, threadId, 0);
              this.logger.log(
                `[Archive Provider Sync] Removed star from thread: userId=${userId}, threadId=${threadId}`,
              );
            } catch (starError: unknown) {
              logErrorToFile(
                `[Archive Provider Sync] Failed to remove star: userId=${userId}, threadId=${threadId}`,
                starError,
                "ArchiveEmailProcessor",
              );
            }
          }

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
