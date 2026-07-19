import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { parseDurationToDate } from "./parse-duration";

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
