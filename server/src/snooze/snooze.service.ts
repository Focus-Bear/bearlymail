import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import * as chrono from "chrono-node";
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

      // Snooze at the thread level
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });

      if (thread) {
        thread.isSnoozed = true;
        thread.snoozeUntil = snoozeUntil;
        await this.emailThreadRepository.save(thread);
        this.logger.log(
          `Snoozed thread ${email.threadId} until ${snoozeUntil.toISOString()}`,
        );
      }

      // Also update the email for backward compatibility
      email.isSnoozed = true;
      email.snoozeUntil = snoozeUntil;
      const savedEmail = await this.emailRepository.save(email);

      // Sync to email provider (Gmail, Office365, etc.)
      try {
        const provider = await this.emailProviderManager.getPrimaryProvider(
          userId,
        );
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
          return new Date(now.getTime() + value * 60 * 1000);
        case "h":
        case "hr":
          return new Date(now.getTime() + value * 60 * 60 * 1000);
        case "d":
          return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
        case "w":
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
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
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        daysUntil += 7;
      }

      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      // Default to 9 AM
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      nextDate.setHours(9, 0, 0, 0);

      return nextDate;
    }

    // Default to 1 hour if parsing fails
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

    async unsnoozeEmail(userId: string, emailId: string): Promise<Email> {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        throw new Error("Email not found");
      }

      // Unsnooze at the thread level
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });

      if (thread) {
        thread.isSnoozed = false;
        thread.snoozeUntil = null;
        await this.emailThreadRepository.save(thread);
        this.logger.log(`Unsnoozed thread ${email.threadId}`);
      }

      // Also update the email for backward compatibility
      email.isSnoozed = false;
      email.snoozeUntil = null;
      const savedEmail = await this.emailRepository.save(email);

      // Sync to email provider (Gmail, Office365, etc.)
      try {
        const provider = await this.emailProviderManager.getPrimaryProvider(
          userId,
        );
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
