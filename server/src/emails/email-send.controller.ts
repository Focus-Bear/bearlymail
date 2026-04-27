import {
  Body,
  Controller,
  forwardRef,
  Inject,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import PgBoss from "pg-boss";

import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { getJobPriority } from "../queue/job-priorities";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { UsersService } from "../users/users.service";
import { EmailAdminService } from "./email-admin.service";
import {
  appendSignature,
  EMAIL_CONTROLLER_DEFAULTS,
  PgBossWithInternals,
} from "./email-controller.helpers";
import { EmailProviderManager } from "./email-provider-manager.service";
import { SendEmailBody } from "./emails.controller.types";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard )
export class EmailSendController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly usersService: UsersService,
    private readonly emailAdminService: EmailAdminService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @Inject(forwardRef(() => ScheduledEmailsService))
    private readonly scheduledEmailsService: ScheduledEmailsService,
  ) {}

  @Post("send")
  @UseInterceptors(FilesInterceptor("files", 10))
  async sendEmail(
    @Request() req,
    @Body() body: SendEmailBody,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const { userId } = req.user;

    const attachments =
      files?.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      })) || undefined;

    if (body.scheduledSendAt) {
      const scheduledSendAt = new Date(body.scheduledSendAt);
      const scheduledAttachments = attachments?.map((att) => ({
        filename: att.filename,
        mimeType: att.mimeType,
        content: att.content.toString("base64"),
      }));

      const scheduledEmail = await this.scheduledEmailsService.scheduleEmail(
        userId,
        {
          emailType: "new",
          to: body.to,
          cc: body.cc,
          bcc: body.bcc,
          subject: body.subject,
          body: body.body,
          attachments: scheduledAttachments,
          scheduledSendAt,
          userTimezone: body.userTimezone,
        },
      );

      return {
        success: true,
        scheduledEmailId: scheduledEmail.id,
        scheduledSendAt: scheduledEmail.scheduledSendAt,
        message: "Email scheduled successfully",
      };
    }

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    const user = await this.usersService.findOne(userId);
    const bodyWithSignature = appendSignature(body.body, user?.emailSignature);

    const result = await provider.sendEmail(userId, {
      to: body.to,
      subject: body.subject,
      body: bodyWithSignature,
      cc: body.cc,
      bcc: body.bcc,
      attachments,
    });

    const allRecipients = [...body.to, ...(body.cc || []), ...(body.bcc || [])];
    await this.emailAdminService.trackEmailRecipients(userId, allRecipients);

    return {
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    };
  }

  @Post(":id/accelerate")
  async accelerateEmail(@Request() req, @Param("id") id: string) {
    const { userId } = req.user;

    const email = await this.emailsService.getEmailById(userId, id);
    if (!email) return { message: ERROR_MESSAGES.EMAIL_NOT_FOUND };

    const queued: string[] = [];
    const cancelled: string[] = [];

    const { db } = this.boss as unknown as PgBossWithInternals;

    const priorityCancelResult = await db.executeSql(
      `UPDATE pgboss.job
       SET state = 'cancelled'
       WHERE name = 'refine-priority'
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [id, userId],
    );
    if (priorityCancelResult?.rowCount > 0) {
      cancelled.push(`refine-priority (${priorityCancelResult.rowCount})`);
    }

    const summaryCancelResult = await db.executeSql(
      `UPDATE pgboss.job
       SET state = 'cancelled'
       WHERE name = 'generate-summary'
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [id, userId],
    );
    if (summaryCancelResult?.rowCount > 0) {
      cancelled.push(`generate-summary (${summaryCancelResult.rowCount})`);
    }

    if (email.isProcessingSummary || !email.summary) {
      await this.boss.send(
        JOB_NAMES.GENERATE_SUMMARY,
        { userId, emailId: id },
        {
          priority: getJobPriority(JOB_NAMES.GENERATE_SUMMARY, true),
          singletonKey: `summary-${id}`,
        },
      );
      queued.push(JOB_NAMES.GENERATE_SUMMARY);
    }

    const priorityScore = email.getPriorityScore();

    let thread = null;
    if (email.emailThreadId) {
      thread = await this.emailAdminService.getEmailThreadById(
        userId,
        email.emailThreadId,
      );
    }

    const hasNoBreakdown =
      !thread?.priorityExplanation?.breakdown ||
      thread.priorityExplanation.breakdown.length === 0;

    if (
      priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE ||
      thread?.isProcessingPriority ||
      (priorityScore === 0 && hasNoBreakdown)
    ) {
      await this.boss.send(
        JOB_NAMES.REFINE_PRIORITY,
        { userId, emailId: id },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY, true),
          singletonKey: `priority-${id}`,
        },
      );
      queued.push(JOB_NAMES.REFINE_PRIORITY);
    }

    return {
      message: "Accelerated processing",
      queued,
      cancelled: cancelled.length > 0 ? cancelled : undefined,
    };
  }

  @Post("recategorize-triage")
  async recategorizeTriageEmails(
    @Request() req,
    @Query("modes") modesParam?: string,
  ) {
    return this.emailAdminService.queueBulkRecategorization(
      req.user.userId,
      modesParam,
    );
  }
}
