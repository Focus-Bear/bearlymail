import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual } from "typeorm";
import {
  ScheduledEmail,
  EmailRecipient,
  EmailAttachment,
} from "../database/entities/scheduled-email.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { ContactsService } from "../contacts/contacts.service";
import { UsersService } from "../users/users.service";

// Time constants for scheduling
const SUNDAY = 0;
const SATURDAY = 6;
const MONDAY_OFFSET = 8;
const DAYS_IN_WEEK = 7;
const BUSINESS_DAY_START_HOUR = 8;
const BUSINESS_DAY_END_HOUR = 17;
const EVENING_CUTOFF_HOUR = 18;
const LATE_NIGHT_START_HOUR = 9;

export interface CreateScheduledEmailDto {
  emailType: "reply" | "new";
  threadId?: string;
  emailId?: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  scheduledSendAt: Date;
  userTimezone?: string;
  expectedReplyHours?: number;
  forwardAttachmentIds?: string[];
}

@Injectable()
export class ScheduledEmailsService {
  private readonly logger = new Logger(ScheduledEmailsService.name);

  constructor(
    @InjectRepository(ScheduledEmail)
    private scheduledEmailRepository: Repository<ScheduledEmail>,
    private emailProviderManager: EmailProviderManager,
    private emailsService: EmailsService,
    private contactsService: ContactsService,
    private usersService: UsersService,
  ) {}

  /**
   * Schedule an email to be sent at a specific time
   */
  async scheduleEmail(
    userId: string,
    dto: CreateScheduledEmailDto,
  ): Promise<ScheduledEmail> {
    const scheduledEmail = this.scheduledEmailRepository.create({
      userId,
      status: "pending",
      emailType: dto.emailType,
      threadId: dto.threadId || null,
      emailId: dto.emailId || null,
      to: dto.to,
      cc: dto.cc || null,
      bcc: dto.bcc || null,
      subject: dto.subject,
      body: dto.body,
      attachments: dto.attachments || null,
      scheduledSendAt: dto.scheduledSendAt,
      sentAt: null,
      errorMessage: null,
      userTimezone: dto.userTimezone || null,
      expectedReplyHours: dto.expectedReplyHours || null,
      forwardAttachmentIds: dto.forwardAttachmentIds || null,
    });

    const saved = await this.scheduledEmailRepository.save(scheduledEmail);
    this.logger.log(
      `Scheduled email ${saved.id} for user ${userId} to be sent at ${dto.scheduledSendAt.toISOString()}`,
    );
    return saved;
  }

  /**
   * Get all scheduled emails for a user
   */
  async getScheduledEmails(userId: string): Promise<ScheduledEmail[]> {
    return this.scheduledEmailRepository.find({
      where: { userId, status: "pending" },
      order: { scheduledSendAt: "ASC" },
    });
  }

  /**
   * Get a specific scheduled email
   */
  async getScheduledEmail(
    userId: string,
    scheduledEmailId: string,
  ): Promise<ScheduledEmail | null> {
    return this.scheduledEmailRepository.findOne({
      where: { id: scheduledEmailId, userId },
    });
  }

  /**
   * Cancel a scheduled email
   */
  async cancelScheduledEmail(
    userId: string,
    scheduledEmailId: string,
  ): Promise<void> {
    const scheduledEmail = await this.getScheduledEmail(
      userId,
      scheduledEmailId,
    );
    if (!scheduledEmail) {
      throw new Error("Scheduled email not found");
    }

    if (scheduledEmail.status !== "pending") {
      throw new Error(
        `Cannot cancel email with status: ${scheduledEmail.status}`,
      );
    }

    scheduledEmail.status = "cancelled";
    await this.scheduledEmailRepository.save(scheduledEmail);
    this.logger.log(`Cancelled scheduled email ${scheduledEmailId}`);
  }

  /**
   * Send all emails that are due to be sent
   * This is called by the background job processor
   */
  async sendDueEmails(): Promise<{
    sent: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    const now = new Date();
    const dueEmails = await this.scheduledEmailRepository.find({
      where: {
        status: "pending",
        scheduledSendAt: LessThanOrEqual(now),
      },
      order: { scheduledSendAt: "ASC" },
    });

    this.logger.log(`Found ${dueEmails.length} emails due to be sent`);

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const scheduledEmail of dueEmails) {
      try {
        await this.sendScheduledEmail(scheduledEmail);
        sent++;
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ id: scheduledEmail.id, error: errorMessage });

        // Mark as failed
        scheduledEmail.status = "failed";
        scheduledEmail.errorMessage = errorMessage;
        await this.scheduledEmailRepository.save(scheduledEmail);

        this.logger.error(
          `Failed to send scheduled email ${scheduledEmail.id}:`,
          error,
        );
      }
    }

    this.logger.log(
      `Processed ${dueEmails.length} scheduled emails: ${sent} sent, ${failed} failed`,
    );

    return { sent, failed, errors };
  }

  /**
   * Send a single scheduled email
   */
  private async sendScheduledEmail(
    scheduledEmail: ScheduledEmail,
  ): Promise<void> {
    const { userId } = scheduledEmail;

    // Get user to append signature
    const user = await this.usersService.findOne(userId);
    const signature =
      user?.emailSignature ||
      "Sent from BearlyMail (anti inbox overwhelm system)";
    const bodyWithSignature = `${scheduledEmail.body}\n\n${signature}`;

    // Convert base64 attachments back to buffers
    const attachments = scheduledEmail.attachments?.map((att) => ({
      filename: att.filename,
      mimeType: att.mimeType,
      content: Buffer.from(att.content, "base64"),
    }));

    if (scheduledEmail.emailType === "reply") {
      // This is a reply to an existing email
      if (!scheduledEmail.emailId || !scheduledEmail.threadId) {
        throw new Error(
          "emailId and threadId are required for reply type emails",
        );
      }

      const email = await this.emailsService.getEmailById(
        userId,
        scheduledEmail.emailId,
      );
      if (!email) {
        throw new Error(
          `Email ${scheduledEmail.emailId} not found for scheduled reply`,
        );
      }

      // Get forward attachments if needed
      const forwardAttachments: Array<{
        filename: string;
        mimeType: string;
        content: Buffer;
      }> = [];
      if (
        scheduledEmail.forwardAttachmentIds &&
        scheduledEmail.forwardAttachmentIds.length > 0
      ) {
        for (const attachmentId of scheduledEmail.forwardAttachmentIds) {
          try {
            const attachment = await this.emailsService.getAttachment(
              userId,
              scheduledEmail.emailId,
              attachmentId,
            );
            forwardAttachments.push({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              content: attachment.data,
            });
          } catch (error) {
            this.logger.warn(
              `Failed to get forward attachment ${attachmentId}:`,
              error,
            );
          }
        }
      }

      // Combine attachments - all should be EmailAttachmentData format
      const allAttachments = [...(attachments || []), ...forwardAttachments];

      // Send reply via provider
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        throw new Error("No email provider connected");
      }

      // Extract first recipient email for provider API (expects string, not array)
      const recipientEmail = scheduledEmail.to[0]?.email;
      if (!recipientEmail) {
        throw new Error("No recipient email found in scheduled email");
      }

      await provider.sendReply(
        userId,
        scheduledEmail.threadId,
        recipientEmail,
        scheduledEmail.subject,
        bodyWithSignature,
        allAttachments.length > 0 ? allAttachments : undefined,
      );

      // Track follow-up if expectedReplyHours is set
      if (scheduledEmail.expectedReplyHours) {
        // This would integrate with the follow-ups service
        // For now, we'll just log it
        this.logger.log(
          `Expected reply in ${scheduledEmail.expectedReplyHours} hours for scheduled email ${scheduledEmail.id}`,
        );
      }
    } else {
      // This is a new email
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        throw new Error("No email provider connected");
      }

      await provider.sendEmail(
        userId,
        scheduledEmail.to,
        scheduledEmail.subject,
        bodyWithSignature,
        scheduledEmail.cc || undefined,
        scheduledEmail.bcc || undefined,
        attachments,
      );
    }

    // Track contact frequency for all recipients
    const allRecipients = [
      ...scheduledEmail.to,
      ...(scheduledEmail.cc || []),
      ...(scheduledEmail.bcc || []),
    ];
    for (const recipient of allRecipients) {
      await this.contactsService.incrementContactFrequency(
        userId,
        recipient.email,
      );
    }

    // Mark as sent
    scheduledEmail.status = "sent";
    scheduledEmail.sentAt = new Date();
    await this.scheduledEmailRepository.save(scheduledEmail);

    this.logger.log(`Successfully sent scheduled email ${scheduledEmail.id}`);
  }

  /**
   * Get smart scheduling suggestions based on current time
   * Returns suggested times in the user's timezone
   */
  getSuggestedTimes(): Array<{
    label: string;
    value: Date;
    description: string;
  }> {
    const now = new Date();
    const suggestions: Array<{
      label: string;
      value: Date;
      description: string;
    }> = [];

    // Get current hour
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if it's the weekend (Saturday or Sunday)
    const isWeekend = currentDay === SUNDAY || currentDay === SATURDAY;

    // Check if it's after 5pm (17:00)
    const isAfterHours = currentHour >= BUSINESS_DAY_END_HOUR;

    // Check if it's before 8am
    const isBeforeHours = currentHour < BUSINESS_DAY_START_HOUR;

    if (isWeekend) {
      // If it's the weekend, suggest Monday at 8am
      const nextMonday = new Date(now);
      const daysUntilMonday = (MONDAY_OFFSET - currentDay) % DAYS_IN_WEEK;
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      nextMonday.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

      suggestions.push({
        label: "Monday 8am",
        value: nextMonday,
        description: "Next business day morning",
      });
    } else if (isAfterHours || isBeforeHours) {
      // If it's after 5pm or before 8am, suggest tomorrow at 8am
      const tomorrow8am = new Date(now);
      if (isAfterHours) {
        tomorrow8am.setDate(now.getDate() + 1);
      }
      tomorrow8am.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

      suggestions.push({
        label: "Tomorrow 8am",
        value: tomorrow8am,
        description: "Next business day morning",
      });
    } else {
      // During business hours, suggest "in 2 hours"
      const in2Hours = new Date(now);
      in2Hours.setHours(now.getHours() + 2, 0, 0, 0);

      suggestions.push({
        label: "In 2 hours",
        value: in2Hours,
        description: "Later today",
      });
    }

    // Always offer "This evening (6pm)"
    const thisEvening = new Date(now);
    if (currentHour >= EVENING_CUTOFF_HOUR) {
      // If it's already past 6pm, suggest tomorrow at 6pm
      thisEvening.setDate(now.getDate() + 1);
    }
    thisEvening.setHours(EVENING_CUTOFF_HOUR, 0, 0, 0);

    suggestions.push({
      label:
        currentHour >= EVENING_CUTOFF_HOUR
          ? "Tomorrow 6pm"
          : "This evening 6pm",
      value: thisEvening,
      description: "End of business day",
    });

    // Always offer "Tomorrow morning (9am)"
    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(now.getDate() + 1);
    tomorrowMorning.setHours(LATE_NIGHT_START_HOUR, 0, 0, 0);

    suggestions.push({
      label: "Tomorrow 9am",
      value: tomorrowMorning,
      description: "Next day morning",
    });

    return suggestions;
  }

  /**
   * Check if a send time is inappropriate (outside business hours or weekend)
   * Returns a warning message if inappropriate, or null if OK
   */
  checkSendTimeAppropriate(scheduledSendAt: Date): {
    isAppropriate: boolean;
    warning?: string;
    suggestion?: Date;
  } {
    const hour = scheduledSendAt.getHours();
    const day = scheduledSendAt.getDay();

    const isWeekend = day === SUNDAY || day === SATURDAY;
    const isAfterHours =
      hour >= BUSINESS_DAY_END_HOUR || hour < BUSINESS_DAY_START_HOUR;

    if (isWeekend) {
      const nextMonday = new Date(scheduledSendAt);
      const daysUntilMonday = (MONDAY_OFFSET - day) % DAYS_IN_WEEK;
      nextMonday.setDate(scheduledSendAt.getDate() + daysUntilMonday);
      nextMonday.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

      return {
        isAppropriate: false,
        warning:
          "This email is scheduled for a weekend. Consider sending on the next business day.",
        suggestion: nextMonday,
      };
    }

    if (isAfterHours) {
      const nextMorning = new Date(scheduledSendAt);
      if (hour >= BUSINESS_DAY_END_HOUR) {
        nextMorning.setDate(scheduledSendAt.getDate() + 1);
      }
      nextMorning.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

      return {
        isAppropriate: false,
        warning:
          "This email is scheduled outside business hours (8am-5pm). Consider sending during business hours.",
        suggestion: nextMorning,
      };
    }

    return { isAppropriate: true };
  }
}
