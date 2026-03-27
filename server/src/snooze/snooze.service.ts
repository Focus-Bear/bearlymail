import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as chrono from "chrono-node";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";

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
  ): Promise<{ id: string; isSnoozed: boolean; snoozeUntil: Date }> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const snoozeUntil = this.parseDuration(duration);

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

  private parseDuration(duration: string): Date {
    const normalized = duration.toLowerCase().trim();

    const parsed = chrono.parseDate(normalized);
    if (parsed) {
      return parsed;
    }

    const now = new Date();
    const regex = /^(\d+)\s*(m|min|h|hr|d|w)$/;
    const match = normalized.match(regex);

    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];

      switch (unit) {
        case "m":
        case "min":
          return new Date(now.getTime() + value * MILLISECONDS.MINUTE);
        case "h":
        case "hr":
          return new Date(now.getTime() + value * MILLISECONDS.HOUR);
        case "d":
          return new Date(now.getTime() + value * MILLISECONDS.DAY);
        case "w":
          return new Date(
            now.getTime() +
              value * SNOOZE_CONSTANTS.DAYS_IN_WEEK * MILLISECONDS.DAY,
          );
      }
    }

    const dayMap: { [key: string]: number } = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };

    if (dayMap[normalized] !== undefined) {
      const targetDay = dayMap[normalized];
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;

      if (daysUntil <= 0) {
        daysUntil += SNOOZE_CONSTANTS.DAYS_IN_WEEK;
      }

      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      nextDate.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);

      return nextDate;
    }

    return new Date(now.getTime() + MILLISECONDS.HOUR);
  }
}
