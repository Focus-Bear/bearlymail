import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DateTime } from "luxon";
import { LessThanOrEqual, Repository } from "typeorm";

import { SCHEDULED_EMAIL_STATUS } from "../constants/domain-statuses";
import { SCHEDULED_EMAIL_TYPES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { ContactsService } from "../contacts/contacts.service";
import {
  EmailAttachment,
  EmailRecipient,
  ScheduledEmail,
} from "../database/entities/scheduled-email.entity";
import {
  appendSignature,
  looksLikeHtml,
} from "../emails/email-controller.helpers";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
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
  emailType: "reply" | "forward" | "new";
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
    private readonly userEncryptionService: UserEncryptionService,
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

    if (scheduledEmail.status !== SCHEDULED_EMAIL_STATUS.PENDING) {
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
    // Project only the unencrypted columns we need to enumerate due emails.
    // The encrypted columns (subject, body, etc.) must be hydrated inside
    // each row's per-user KMS context — see loop below.
    const dueEmailRefs = await this.scheduledEmailRepository.find({
      where: {
        status: "pending",
        scheduledSendAt: LessThanOrEqual(now),
      },
      order: { scheduledSendAt: "ASC" },
      select: {
        id: true,
        userId: true,
      },
    });

    this.logger.log(`Found ${dueEmailRefs.length} emails due to be sent`);

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const ref of dueEmailRefs) {
      try {
        // Hydrate the full row (including encrypted columns) and send it
        // inside the user's KMS-derived encryption context, so transformers
        // decrypt under the same key the row was written with.
        await this.userEncryptionService.withUserKey(ref.userId, async () => {
          const scheduledEmail = await this.scheduledEmailRepository.findOne({
            where: { id: ref.id },
          });
          if (!scheduledEmail) {
            this.logger.warn(
              `Scheduled email ${ref.id} disappeared between projection and send — skipping`,
            );
            return;
          }
          await this.sendScheduledEmail(scheduledEmail);
          sent++;
        });
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ id: ref.id, error: errorMessage });

        // Mark as failed (status is unencrypted, no per-user context required).
        await this.scheduledEmailRepository.update(
          { id: ref.id },
          { status: "failed", errorMessage },
        );

        this.logger.error(`Failed to send scheduled email ${ref.id}:`, error);
      }
    }

    this.logger.log(
      `Processed ${dueEmailRefs.length} scheduled emails: ${sent} sent, ${failed} failed`,
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

    const user = await this.usersService.findOne(userId);
    // HTML-aware: appends the signature with <br><br> for HTML bodies, \n\n for
    // plain — reused from the immediate-send helpers so scheduled and immediate
    // sends format identically.
    const bodyWithSignature = appendSignature(
      scheduledEmail.body,
      user?.emailSignature,
    );
    // Replies are composed as HTML (`<p>…</p>`). Without an htmlBody the provider
    // sends text/plain only, so the recipient sees raw tags (the reported bug:
    // scheduled replies arrived unrendered). Send the HTML as htmlBody when the
    // body is HTML — mirroring the immediate reply path. Plain bodies stay plain.
    const htmlBodyWithSignature = looksLikeHtml(scheduledEmail.body)
      ? bodyWithSignature
      : undefined;

    const attachments = scheduledEmail.attachments?.map((att) => ({
      filename: att.filename,
      mimeType: att.mimeType,
      content: Buffer.from(att.content, "base64"),
    }));

    if (scheduledEmail.emailType === SCHEDULED_EMAIL_TYPES.REPLY) {
      await this.sendScheduledReply(
        scheduledEmail,
        userId,
        bodyWithSignature,
        attachments,
        htmlBodyWithSignature,
      );
    } else if (scheduledEmail.emailType === SCHEDULED_EMAIL_TYPES.FORWARD) {
      await this.sendScheduledForward(
        scheduledEmail,
        userId,
        bodyWithSignature,
        attachments,
      );
    } else {
      await this.sendScheduledNewEmail(
        scheduledEmail,
        userId,
        bodyWithSignature,
        attachments,
      );
    }

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

    scheduledEmail.status = "sent";
    scheduledEmail.sentAt = new Date();
    await this.scheduledEmailRepository.save(scheduledEmail);

    this.logger.log(`Successfully sent scheduled email ${scheduledEmail.id}`);
  }

  private async sendScheduledReply(
    scheduledEmail: ScheduledEmail,
    userId: string,
    bodyWithSignature: string,
    attachments:
      | Array<{ filename: string; mimeType: string; content: Buffer }>
      | undefined,
    htmlBody: string | undefined,
  ): Promise<void> {
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
            content: attachment.attachmentBuffer,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to get forward attachment ${attachmentId}:`,
            error,
          );
        }
      }
    }

    const allAttachments = [...(attachments || []), ...forwardAttachments];
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
    }

    const recipientEmail = scheduledEmail.to[0]?.email;
    if (!recipientEmail) {
      throw new Error("No recipient email found in scheduled email");
    }

    await provider.sendReply(userId, {
      threadId: scheduledEmail.threadId,
      to: recipientEmail,
      subject: scheduledEmail.subject,
      body: bodyWithSignature,
      options: {
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
        htmlBody,
      },
    });

    if (scheduledEmail.expectedReplyHours) {
      this.logger.log(
        `Expected reply in ${scheduledEmail.expectedReplyHours} hours for scheduled email ${scheduledEmail.id}`,
      );
    }
  }

  /**
   * Send a scheduled forward as a new standalone email (not threaded into original).
   * Bug 3 fix: forwards must use sendEmail, not sendReply, to avoid threading.
   * Bug 5 fix: BCC recipients are propagated.
   */
  private async sendScheduledForward(
    scheduledEmail: ScheduledEmail,
    userId: string,
    bodyWithSignature: string,
    attachments:
      | Array<{ filename: string; mimeType: string; content: Buffer }>
      | undefined,
  ): Promise<void> {
    if (!scheduledEmail.emailId) {
      throw new Error("emailId is required for forward type emails");
    }

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
    }

    // Re-fetch forward attachments if any were stored
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
            content: attachment.attachmentBuffer,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to get forward attachment ${attachmentId}:`,
            error,
          );
        }
      }
    }

    const allAttachments = [...(attachments || []), ...forwardAttachments];

    const recipientEmail = scheduledEmail.to[0]?.email;
    if (!recipientEmail) {
      throw new Error("No recipient email found in scheduled forward");
    }

    // Build recipient arrays — to, cc, bcc may be stored as EmailRecipient[] in the entity
    const toRecipients = scheduledEmail.to;
    const ccRecipients =
      scheduledEmail.cc && scheduledEmail.cc.length > 0
        ? scheduledEmail.cc
        : undefined;
    const bccRecipients =
      scheduledEmail.bcc && scheduledEmail.bcc.length > 0
        ? scheduledEmail.bcc
        : undefined;

    await provider.sendEmail(userId, {
      to: toRecipients,
      subject: scheduledEmail.subject,
      body: bodyWithSignature,
      cc: ccRecipients,
      bcc: bccRecipients,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    });

    if (scheduledEmail.expectedReplyHours) {
      this.logger.log(
        `Expected reply in ${scheduledEmail.expectedReplyHours} hours for scheduled forward ${scheduledEmail.id}`,
      );
    }
  }

  private async sendScheduledNewEmail(
    scheduledEmail: ScheduledEmail,
    userId: string,
    bodyWithSignature: string,
    attachments:
      | Array<{ filename: string; mimeType: string; content: Buffer }>
      | undefined,
  ): Promise<void> {
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
    }

    await provider.sendEmail(userId, {
      to: scheduledEmail.to,
      subject: scheduledEmail.subject,
      body: bodyWithSignature,
      cc: scheduledEmail.cc || undefined,
      bcc: scheduledEmail.bcc || undefined,
      attachments,
    });
  }

  /**
   * Get smart scheduling suggestions based on current time
   * Returns suggested times in the user's timezone
   */
  getSuggestedTimes(userTimezone?: string): Array<{
    label: string;
    value: Date;
    description: string;
  }> {
    // Use user's timezone if provided, otherwise default to UTC
    const timezone = userTimezone || "UTC";
    const now = DateTime.now().setZone(timezone);

    const suggestions: Array<{
      label: string;
      value: Date;
      description: string;
    }> = [];

    // Get current hour in user's timezone
    const currentHour = now.hour;
    // Convert ISO weekday (1=Mon) to JS weekday (0=Sun)
    const currentDay = now.weekday % DAYS_IN_WEEK;

    // Check if it's the weekend (Saturday or Sunday)
    const isWeekend = currentDay === SUNDAY || currentDay === SATURDAY;

    // Check if it's after 5pm (17:00)
    const isAfterHours = currentHour >= BUSINESS_DAY_END_HOUR;

    // Check if it's before 8am
    const isBeforeHours = currentHour < BUSINESS_DAY_START_HOUR;

    if (isWeekend) {
      // If it's the weekend, suggest Monday at 8am
      const daysUntilMonday = (MONDAY_OFFSET - currentDay) % DAYS_IN_WEEK;
      const nextMonday = now.plus({ days: daysUntilMonday }).set({
        hour: BUSINESS_DAY_START_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      suggestions.push({
        label: "Monday 8am",
        value: nextMonday.toJSDate(),
        description: "Next business day morning",
      });
    } else if (isAfterHours || isBeforeHours) {
      // If it's after 5pm or before 8am, suggest tomorrow at 8am
      const daysToAdd = isAfterHours ? 1 : 0;
      const tomorrow8am = now.plus({ days: daysToAdd }).set({
        hour: BUSINESS_DAY_START_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      suggestions.push({
        label: "Tomorrow 8am",
        value: tomorrow8am.toJSDate(),
        description: "Next business day morning",
      });
    } else {
      // During business hours, suggest "in 2 hours"
      const in2Hours = now
        .plus({ hours: 2 })
        .set({ minute: 0, second: 0, millisecond: 0 });

      suggestions.push({
        label: "In 2 hours",
        value: in2Hours.toJSDate(),
        description: "Later today",
      });
    }

    // Always offer "This evening (6pm)"
    const daysToAdd = currentHour >= EVENING_CUTOFF_HOUR ? 1 : 0;
    const thisEvening = now
      .plus({ days: daysToAdd })
      .set({ hour: EVENING_CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });

    suggestions.push({
      label:
        currentHour >= EVENING_CUTOFF_HOUR
          ? "Tomorrow 6pm"
          : "This evening 6pm",
      value: thisEvening.toJSDate(),
      description: "End of business day",
    });

    // Always offer "Tomorrow morning (9am)"
    const tomorrowMorning = now.plus({ days: 1 }).set({
      hour: LATE_NIGHT_START_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    suggestions.push({
      label: "Tomorrow 9am",
      value: tomorrowMorning.toJSDate(),
      description: "Next day morning",
    });

    return suggestions;
  }

  /**
   * Check if a send time is inappropriate (outside business hours or weekend)
   * Returns a warning message if inappropriate, or null if OK
   */
  checkSendTimeAppropriate(
    scheduledSendAt: Date,
    userTimezone?: string,
  ): {
    isAppropriate: boolean;
    warning?: string;
    suggestion?: Date;
  } {
    const timezone = userTimezone || "UTC";
    const sendTime = DateTime.fromJSDate(scheduledSendAt).setZone(timezone);

    const { hour } = sendTime;
    // Convert ISO weekday to JS weekday
    const day = sendTime.weekday % DAYS_IN_WEEK;

    const isWeekend = day === SUNDAY || day === SATURDAY;
    const isAfterHours =
      hour >= BUSINESS_DAY_END_HOUR || hour < BUSINESS_DAY_START_HOUR;

    if (isWeekend) {
      const daysUntilMonday = (MONDAY_OFFSET - day) % DAYS_IN_WEEK;
      const nextMonday = sendTime.plus({ days: daysUntilMonday }).set({
        hour: BUSINESS_DAY_START_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      return {
        isAppropriate: false,
        warning:
          "This email is scheduled for a weekend. Consider sending on the next business day.",
        suggestion: nextMonday.toJSDate(),
      };
    }

    if (isAfterHours) {
      const daysToAdd = hour >= BUSINESS_DAY_END_HOUR ? 1 : 0;
      const nextMorning = sendTime.plus({ days: daysToAdd }).set({
        hour: BUSINESS_DAY_START_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      return {
        isAppropriate: false,
        warning:
          "This email is scheduled outside business hours (8am-5pm). Consider sending during business hours.",
        suggestion: nextMorning.toJSDate(),
      };
    }

    return { isAppropriate: true };
  }
}
