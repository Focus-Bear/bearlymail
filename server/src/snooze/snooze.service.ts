import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { getJobPriority } from "../queue/job-priorities";
import { parseDurationToDate } from "./parse-duration";

export interface BulkSnoozeResult {
  snoozedEmailIds: string[];
  threadCount: number;
  snoozeUntil: Date | null;
}

@Injectable()
export class SnoozeService {
  private readonly logger = new Logger(SnoozeService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async snoozeEmail(
    userId: string,
    emailId: string,
    duration: string,
    locale = "en",
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date }> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const snoozeUntil = this.parseDuration(duration, locale);

    const thread = await this.findThreadForEmail(email, emailId);

    thread.isSnoozed = true;
    thread.snoozeUntil = snoozeUntil;
    thread.lastUserOperationAt = new Date();
    thread.syncStatus = "unsynced";
    thread.syncStatusUpdatedAt = new Date();
    await this.emailThreadRepository.save(thread);

    email.isSnoozed = true;
    email.snoozeUntil = snoozeUntil;
    await this.emailRepository.save(email);

    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        await provider.snoozeThread(userId, email.threadId, snoozeUntil);
        thread.syncStatus = "synced";
        thread.syncStatusUpdatedAt = new Date();
        await this.emailThreadRepository.save(thread);
        this.logger.log(
          `Snoozed and synced thread ${thread.id} (Gmail: ${email.threadId}) until ${snoozeUntil.toISOString()}`,
        );
      } else {
        this.logger.warn(
          `No email provider for user ${userId}, skipping provider sync for snooze`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to sync snooze to email provider for email ${emailId}:`,
        error,
      );
    }

    return { id: thread.id, isSnoozed: thread.isSnoozed, snoozeUntil };
  }

  /**
   * Snooze many emails until the same moment. The duration is parsed once so every
   * selected thread lands on an identical wake-up time, and provider sync is queued
   * per thread rather than awaited — a large selection would otherwise make the
   * request wait on one provider round-trip per thread.
   */
  async bulkSnoozeEmails(
    userId: string,
    emailIds: string[],
    duration: string,
    locale = "en",
  ): Promise<BulkSnoozeResult> {
    if (emailIds.length === 0) {
      return { snoozedEmailIds: [], threadCount: 0, snoozeUntil: null };
    }

    const snoozeUntil = this.parseDuration(duration, locale);

    // Only plaintext columns: hydrating full entities would decrypt fields this
    // path never reads (see the comment in SnoozeProcessor for the same trap).
    const emails = await this.emailRepository.find({
      where: { userId, id: In(emailIds) },
      select: { id: true, threadId: true },
    });
    if (emails.length === 0) {
      this.logger.warn(
        `[Snooze] No emails found for bulk snooze: userId=${userId}`,
      );
      return { snoozedEmailIds: [], threadCount: 0, snoozeUntil };
    }

    const threadIds = [
      ...new Set(emails.map((email) => email.threadId).filter(Boolean)),
    ];
    const now = new Date();

    await this.emailThreadRepository.update(
      { userId, threadId: In(threadIds) },
      {
        isSnoozed: true,
        snoozeUntil,
        lastUserOperationAt: now,
        syncStatus: "unsynced",
        syncStatusUpdatedAt: now,
      },
    );
    await this.emailRepository.update(
      { userId, threadId: In(threadIds) },
      { isSnoozed: true, snoozeUntil },
    );

    this.logger.log(
      `[Snooze] Bulk snoozed ${emails.length} emails in ${threadIds.length} threads until ` +
        `${snoozeUntil.toISOString()}: userId=${userId}`,
    );

    for (const threadId of threadIds) {
      this.queueProviderSnoozeSync(userId, threadId, snoozeUntil);
    }

    return {
      snoozedEmailIds: emails.map((email) => email.id),
      threadCount: threadIds.length,
      snoozeUntil,
    };
  }

  private queueProviderSnoozeSync(
    userId: string,
    threadId: string,
    snoozeUntil: Date,
  ): void {
    this.boss
      .send(
        JOB_NAMES.SNOOZE_THREAD_PROVIDER_SYNC,
        { userId, threadId, snoozeUntil: snoozeUntil.toISOString() },
        {
          priority: getJobPriority(JOB_NAMES.SNOOZE_THREAD_PROVIDER_SYNC, true),
          singletonKey: `snooze-provider-sync-${threadId}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      )
      .catch((error: unknown) =>
        this.logger.error(
          `[Snooze] Failed to queue provider sync job for thread ${threadId}:`,
          error,
        ),
      );
  }

  async unsnoozeEmail(
    userId: string,
    emailId: string,
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date | null }> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const thread = await this.findThreadForEmail(email, emailId);

    thread.isSnoozed = false;
    thread.snoozeUntil = null;
    thread.lastUserOperationAt = new Date();
    thread.syncStatus = "unsynced";
    thread.syncStatusUpdatedAt = new Date();
    await this.emailThreadRepository.save(thread);

    email.isSnoozed = false;
    email.snoozeUntil = null;
    await this.emailRepository.save(email);

    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        await provider.unsnoozeThread(userId, email.threadId);
        thread.syncStatus = "synced";
        thread.syncStatusUpdatedAt = new Date();
        await this.emailThreadRepository.save(thread);
        this.logger.log(
          `Unsnoozed and synced thread ${thread.id} (Gmail: ${email.threadId})`,
        );
      } else {
        this.logger.warn(
          `No email provider for user ${userId}, skipping provider sync for unsnooze`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to sync unsnooze to email provider for email ${emailId}:`,
        error,
      );
    }

    return { id: thread.id, isSnoozed: thread.isSnoozed, snoozeUntil: null };
  }

  private async findThreadForEmail(
    email: Email,
    emailId: string,
  ): Promise<EmailThread> {
    let thread: EmailThread | null = null;

    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId: email.userId },
      });
    }

    if (!thread && email.threadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { userId: email.userId, threadId: email.threadId },
      });
      if (thread) {
        this.logger.warn(
          `Thread found by Gmail threadId but not by emailThreadId for email ${emailId}. ` +
            `emailThreadId=${email.emailThreadId}, threadId=${email.threadId}, thread.id=${thread.id}`,
        );
      }
    }

    if (!thread) {
      throw new Error(
        `Cannot snooze email ${emailId}: thread not found. emailThreadId=${email.emailThreadId}, threadId=${email.threadId}`,
      );
    }

    return thread;
  }

  private parseDuration(duration: string, locale = "en"): Date {
    return parseDurationToDate(duration, new Date(), locale);
  }
}
