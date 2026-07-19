import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { logErrorToFile } from "../utils/error-logger";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailsService } from "./emails.service";

interface ArchiveEmailJobData {
  userId: string;
  emailId: string;
  isBlocked?: boolean;
}

interface ArchiveProviderSyncJobData {
  userId: string;
  threadId: string;
  wasStarred?: boolean;
}

@Injectable()
export class ArchiveEmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(ArchiveEmailProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker(this.boss, JOB_NAMES.ARCHIVE_EMAIL, async (job) =>
      this.handleArchiveEmail(job.data as ArchiveEmailJobData),
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC,
      async (job) =>
        this.handleArchiveProviderSync(job.data as ArchiveProviderSyncJobData),
    );
    this.logger.log(
      "ArchiveEmailProcessor initialized - archive-email and archive-email-provider-sync handlers registered",
    );
  }

  private async handleArchiveEmail(
    jobData: ArchiveEmailJobData,
  ): Promise<void> {
    const { userId, emailId, isBlocked } = jobData;
    this.logger.log(
      `[Archive Job] Processing archive job: userId=${userId}, emailId=${emailId}, isBlocked=${!!isBlocked}`,
    );

    try {
      // archiveEmail and addBlockedLabel touch encrypted Email columns; they
      // need the per-user KMS key in AsyncLocalStorage so transformers
      // encrypt/decrypt under the same key the HTTP path uses.
      await this.userEncryptionService.withUserKey(userId, async () => {
        await this.emailsService.archiveEmail(userId, emailId);
        this.logger.log(
          `[Archive Job] Successfully archived email: userId=${userId}, emailId=${emailId}`,
        );

        if (isBlocked) {
          await this.addBlockedLabel(userId, emailId);
        }
      });
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
  }

  private async addBlockedLabel(
    userId: string,
    emailId: string,
  ): Promise<void> {
    try {
      const email = await this.emailsService.getEmailById(userId, emailId);
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

  private async handleArchiveProviderSync(
    jobData: ArchiveProviderSyncJobData,
  ): Promise<void> {
    const { userId, threadId, wasStarred } = jobData;
    this.logger.log(
      `[Archive Provider Sync] Processing: userId=${userId}, threadId=${threadId}, wasStarred=${!!wasStarred}`,
    );

    try {
      // getPrimaryProvider reads encrypted OAuth tokens (Google/Office365/Zoho
      // account entities use encryptedColumnTransformer). Wrap with the user's
      // KMS key so those decrypts succeed.
      await this.userEncryptionService.withUserKey(userId, async () => {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "archiveThread" in provider) {
          await provider.archiveThread(userId, threadId);
          this.logger.log(
            `[Archive Provider Sync] Archived thread: userId=${userId}, threadId=${threadId}`,
          );

          if (wasStarred && "syncStarStatusToGmail" in provider) {
            await this.removeStarFromThread(provider, userId, threadId);
          }

          this.logger.log(
            `[Archive Provider Sync] Completed: userId=${userId}, threadId=${threadId}`,
          );
          await this.emailsService.markThreadSyncStatus(
            userId,
            threadId,
            "synced",
          );
        } else {
          this.logger.warn(
            `[Archive Provider Sync] No provider available: userId=${userId}`,
          );
        }
      });
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
  }

  private async removeStarFromThread(
    provider: {
      syncStarStatusToGmail: (
        userId: string,
        threadId: string,
        starCount: number,
      ) => Promise<void>;
    },
    userId: string,
    threadId: string,
  ): Promise<void> {
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
}
