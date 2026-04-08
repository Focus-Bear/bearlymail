import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import { SuggestedRepliesService } from "../suggested-replies/suggested-replies.service";
import { EmailProviderManager } from "./email-provider-manager.service";

@Injectable()
export class EmailStarService {
  private readonly logger = new Logger(EmailStarService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(forwardRef(() => SuggestedRepliesService))
    private suggestedRepliesService: SuggestedRepliesService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * Set star count for an email's thread
   */
  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
    updateThreadStarCount: (
      userId: string,
      threadId: string,
      starCount: number,
    ) => Promise<void>,
  ): Promise<Email> {
    const email = await getEmailById(userId, emailId);
    if (!email) {
      throw new Error(`Email ${emailId} not found`);
    }

    if (!email.threadId) {
      this.logger.warn(
        `Email ${emailId} has no threadId, cannot set star count`,
      );
      return email;
    }

    // Get current thread star count
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId: email.threadId },
    });
    const oldStarCount = thread?.starCount ?? 0;

    // Ensure starCount is between 0-3
    const newStarCount = Math.max(0, Math.min(3, starCount));
    await updateThreadStarCount(userId, email.threadId, newStarCount);
    await this.emailThreadRepository.update(
      { userId, threadId: email.threadId },
      { syncStatus: "unsynced", syncStatusUpdatedAt: new Date() },
    );

    // Sync star status to Gmail
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "syncStarStatusToGmail" in provider) {
        await provider.syncStarStatusToGmail(
          userId,
          email.threadId,
          newStarCount,
        );
        await this.emailThreadRepository.update(
          { userId, threadId: email.threadId },
          { syncStatus: "synced", syncStatusUpdatedAt: new Date() },
        );
      }
    } catch (error) {
      // Log error but don't fail - star status can be fixed by sync job
      this.logger.error(
        `Failed to sync star status to Gmail for user ${userId}, thread ${email.threadId}:`,
        error,
      );
    }

    // Trigger learning if star count changed
    if (oldStarCount !== newStarCount) {
      // Queue learning job asynchronously (don't block the response)
      this.boss
        .send(
          JOB_NAMES.LEARN_FROM_STAR,
          { userId, emailId, starCount: newStarCount },
          {
            priority: getJobPriority(JOB_NAMES.LEARN_FROM_STAR, false),
          },
        )
        .catch((err) => this.logger.error("Failed to queue learning job", err));

      // If email is being flagged for action (starCount > 0), queue suggested reply generation
      // Use thread.id (EmailThread UUID) not email.threadId (Gmail thread ID) to match processor expectations
      if (newStarCount > 0 && oldStarCount === 0 && thread) {
        this.suggestedRepliesService
          .queueSuggestedReplyGeneration(userId, thread.id, emailId)
          .catch((err) =>
            this.logger.error(
              "Failed to queue suggested reply generation",
              err,
            ),
          );
      }
    }

    this.logger.debug(
      `Set star count to ${newStarCount} for email ${emailId} (thread: ${email.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...)`,
    );

    return email;
  }

  /**
   * Toggle star for an email (backwards compatibility - toggle between 0 and 3 stars)
   */
  async toggleStar(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
    updateThreadStarCount: (
      userId: string,
      threadId: string,
      starCount: number,
    ) => Promise<void>,
  ): Promise<Email> {
    const email = await getEmailById(userId, emailId);
    if (!email) {
      throw new Error(`Email ${emailId} not found`);
    }

    if (!email.threadId) {
      this.logger.warn(`Email ${emailId} has no threadId, cannot toggle star`);
      return email;
    }

    // Get current thread star count
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId: email.threadId },
    });
    const currentStarCount = thread?.starCount ?? 0;
    const newStarCount = currentStarCount > 0 ? 0 : 3;
    await updateThreadStarCount(userId, email.threadId, newStarCount);
    await this.emailThreadRepository.update(
      { userId, threadId: email.threadId },
      { syncStatus: "unsynced", syncStatusUpdatedAt: new Date() },
    );

    // Sync star status to Gmail
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "syncStarStatusToGmail" in provider) {
        await provider.syncStarStatusToGmail(
          userId,
          email.threadId,
          newStarCount,
        );
        await this.emailThreadRepository.update(
          { userId, threadId: email.threadId },
          { syncStatus: "synced", syncStatusUpdatedAt: new Date() },
        );
      }
    } catch (error) {
      // Log error but don't fail - star status can be fixed by sync job
      this.logger.error(
        `Failed to sync star status to Gmail for user ${userId}, thread ${email.threadId}:`,
        error,
      );
    }

    this.logger.debug(
      `Toggled star for email ${emailId} (thread: ${email.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...): ${currentStarCount} -> ${newStarCount}`,
    );

    return email;
  }
}
