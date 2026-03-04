import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as chrono from "chrono-node";
import { Repository } from "typeorm";

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
  ): Promise<Email> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error("Email not found");
    }

    const snoozeUntil = this.parseDuration(duration);

    // Snooze at the thread level - use emailThreadId (UUID FK) for reliable lookup
    // This is more reliable than threadId (Gmail thread ID) because it uses the actual FK relationship
    let thread: EmailThread | null = null;

    // First try to find by emailThreadId (the UUID foreign key) - most reliable
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId },
      });
    }

    // Fallback to threadId (Gmail thread ID) if emailThreadId lookup failed
    if (!thread && email.threadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      if (thread) {
        this.logger.warn(
          `Thread found by Gmail threadId but not by emailThreadId for email ${emailId}. ` +
            `emailThreadId=${email.emailThreadId}, threadId=${email.threadId}, thread.id=${thread.id}`,
        );
      }
    }

    if (thread) {
      thread.isSnoozed = true;
      thread.snoozeUntil = snoozeUntil;
      thread.lastUserOperationAt = new Date();
      await this.emailThreadRepository.save(thread);
      this.logger.log(
        `Snoozed thread ${thread.id} (Gmail: ${email.threadId}) until ${snoozeUntil.toISOString()} (user operation)`,
      );
    } else {
      // Log error - this should not happen in normal operation
      this.logger.error(
        `Failed to find thread for email ${emailId}. emailThreadId=${email.emailThreadId}, threadId=${email.threadId}. ` +
          `Snooze will only be applied to email, not thread. Email may still appear in inbox!`,
      );
    }

    // Also update the email for backward compatibility
    email.isSnoozed = true;
    email.snoozeUntil = snoozeUntil;
    const savedEmail = await this.emailRepository.save(email);

    // Sync to email provider (Gmail, Office365, etc.)
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        await provider.snoozeThread(userId, email.threadId, snoozeUntil);
        this.logger.log(
          `Successfully synced snooze to provider for email ${emailId}, thread ${email.threadId}`,
        );
      } else {
        this.logger.warn(
          `No email provider connected for user ${userId}, skipping provider sync for snooze`,
        );
      }
    } catch (error: unknown) {
      // Log error but don't fail the request - database update succeeded
      this.logger.error(
        `Failed to sync snooze to email provider for email ${emailId}:`,
        error,
      );
    }

    return savedEmail;
  }

  private parseDuration(duration: string): Date {
    const normalized = duration.toLowerCase().trim();

    // Parse with chrono for natural language dates
    const parsed = chrono.parseDate(normalized);
    if (parsed) {
      return parsed;
    }

    // Manual parsing for simple formats
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

    // Try day names (mon, tue, wed, etc.)
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
        // Next week
        daysUntil += SNOOZE_CONSTANTS.DAYS_IN_WEEK;
      }

      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      // Default to 9 AM
      nextDate.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);

      return nextDate;
    }

    // Default to 1 hour if parsing fails
    return new Date(now.getTime() + MILLISECONDS.HOUR);
  }

  async unsnoozeEmail(userId: string, emailId: string): Promise<Email> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error("Email not found");
    }

    // Unsnooze at the thread level - use emailThreadId (UUID FK) for reliable lookup
    let thread: EmailThread | null = null;

    // First try to find by emailThreadId (the UUID foreign key) - most reliable
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId },
      });
    }

    // Fallback to threadId (Gmail thread ID) if emailThreadId lookup failed
    if (!thread && email.threadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      if (thread) {
        this.logger.warn(
          `Thread found by Gmail threadId but not by emailThreadId for email ${emailId}. ` +
            `emailThreadId=${email.emailThreadId}, threadId=${email.threadId}, thread.id=${thread.id}`,
        );
      }
    }

    if (thread) {
      thread.isSnoozed = false;
      thread.snoozeUntil = null;
      await this.emailThreadRepository.save(thread);
      this.logger.log(
        `Unsnoozed thread ${thread.id} (Gmail: ${email.threadId})`,
      );
    } else {
      this.logger.warn(
        `Failed to find thread for email ${emailId} during unsnooze. ` +
          `emailThreadId=${email.emailThreadId}, threadId=${email.threadId}`,
      );
    }

    // Also update the email for backward compatibility
    email.isSnoozed = false;
    email.snoozeUntil = null;
    const savedEmail = await this.emailRepository.save(email);

    // Sync to email provider (Gmail, Office365, etc.)
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        await provider.unsnoozeThread(userId, email.threadId);
        this.logger.log(
          `Successfully synced unsnooze to provider for email ${emailId}, thread ${email.threadId}`,
        );
      } else {
        this.logger.warn(
          `No email provider connected for user ${userId}, skipping provider sync for unsnooze`,
        );
      }
    } catch (error: unknown) {
      // Log error but don't fail the request - database update succeeded
      this.logger.error(
        `Failed to sync unsnooze to email provider for email ${emailId}:`,
        error,
      );
    }

    return savedEmail;
  }
}
