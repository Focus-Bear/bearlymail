import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { formatGaxiosError } from "../types/common";
import { EmailProviderManager } from "./email-provider-manager.service";
import { ReadStatusSyncJobData } from "./read-status-sync.service";

type ReadStatusSnapshot = Pick<Email, "threadId" | "messageId" | "isRead">;

@Injectable()
export class ReadStatusSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(ReadStatusSyncProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker(
      this.boss,
      JOB_NAMES.READ_STATUS_PROVIDER_SYNC,
      async (job) =>
        this.handleReadStatusSync(job.data as ReadStatusSyncJobData),
    );
  }

  /**
   * Rethrows after logging so pg-boss retries transient provider failures; the
   * user's request was answered long before this runs.
   */
  async handleReadStatusSync(jobData: ReadStatusSyncJobData): Promise<void> {
    const { userId, emailId } = jobData;
    try {
      // getPrimaryProvider decrypts the user's OAuth tokens, which a job can
      // only do under the user's KMS key.
      await this.userEncryptionService.withUserKey(userId, () =>
        this.syncToProvider(jobData),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `[Read Sync] Provider sync failed: userId=${userId}, emailId=${emailId}: ${formatGaxiosError(error)}`,
      );
      throw error;
    }
  }

  private async syncToProvider({
    userId,
    emailId,
  }: ReadStatusSyncJobData): Promise<void> {
    const email = await this.loadReadStatus(userId, emailId);
    if (!email?.threadId || !email.messageId) return;

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider?.syncReadStatus) return;

    await provider.syncReadStatus(
      userId,
      { threadId: email.threadId, messageId: email.messageId },
      email.isRead,
    );
  }

  private loadReadStatus(
    userId: string,
    emailId: string,
  ): Promise<ReadStatusSnapshot | null> {
    return this.emailRepository.findOne({
      where: { id: emailId, userId },
      select: { threadId: true, messageId: true, isRead: true },
    });
  }
}
