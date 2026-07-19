import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  BOOLEAN_STRING_VALUES,
  UPLOAD_FIELD_NAMES,
} from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { EmailsService } from "../emails/emails.service";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { durationToHours } from "../snooze/parse-duration";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { parseRecipientsFromString } from "../utils/email-address.utils";
import { buildReplySubject } from "../utils/reply-subject.util";
import { RepliesService, ReplyRule } from "./replies.service";

@Controller("replies")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
export class RepliesController {
  constructor(
    private readonly repliesService: RepliesService,
    @Inject(forwardRef(() => ScheduledEmailsService))
    private readonly scheduledEmailsService: ScheduledEmailsService,
    private readonly emailsService: EmailsService,
  ) {}

  @Post("draft/:id")
  async generateDraft(
    @Request() req,
    @Param("id") id: string,
    @Body() body?: { provider?: "gemini" | "openai" },
  ) {
    return {
      draft: await this.repliesService.generateDraftReply(
        req.user.userId,
        id,
        body?.provider,
      ),
    };
  }

  @Post("learn")
  async learnFromModification(
    @Request() req,
    @Body()
    body: { emailId: string; originalDraft: string; modifiedDraft: string },
  ) {
    return this.repliesService.learnFromModification(
      req.user.userId,
      body.emailId,
      body.originalDraft,
      body.modifiedDraft,
    );
  }

  @Get("rules")
  async getRules(@Request() req) {
    return this.repliesService.getReplyRules(req.user.userId);
  }

  @Post("rules")
  async createRule(@Request() req, @Body() rule: ReplyRule) {
    return this.repliesService.createReplyRule(req.user.userId, rule);
  }

  @Put("rules/:id")
  async updateRule(
    @Request() req,
    @Param("id") id: string,
    @Body() updates: Partial<ReplyRule>,
  ) {
    return this.repliesService.updateReplyRule(req.user.userId, id, updates);
  }

  @Delete("rules/:id")
  async deleteRule(@Request() req, @Param("id") id: string) {
    await this.repliesService.deleteReplyRule(req.user.userId, id);
    return { message: "Rule deleted" };
  }

  @Post("send/:id")
  @UseInterceptors(AnyFilesInterceptor())
  async sendReply(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      reply: string;
      recipients?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      replyAll?: boolean | string;
      isForward?: boolean | string;
      expectedReplyHours?: number | string;
      /**
       * Free-text follow-up window ("3d", "next Monday", "5pm"), parsed with
       * the same parser as snooze. When present it takes precedence over
       * expectedReplyHours and is converted to whole hours.
       */
      expectedReplyDuration?: string;
      forwardAttachmentIds?: string | string[];
      scheduledSendAt?: string;
      userTimezone?: string;
      keepInAction?: boolean | string;
      /** UI language (e.g. "en", "es") used to parse expectedReplyDuration. */
      locale?: string;
    },
    @UploadedFiles() allFiles?: Express.Multer.File[],
  ) {
    // Separate regular file attachments from inline images.
    // Inline images use fieldname 'inlineImages'; their originalname encodes the
    // CID as "<cid>::::<filename>" so the MIME Content-ID header can be set correctly.
    const regularFiles = (allFiles ?? []).filter(
      (fileItem) => fileItem.fieldname === UPLOAD_FIELD_NAMES.FILES,
    );
    const inlineImageFiles = (allFiles ?? []).filter(
      (fileItem) => fileItem.fieldname === UPLOAD_FIELD_NAMES.INLINE_IMAGES,
    );

    const attachments = regularFiles.map((file) => ({
      filename: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
    }));

    const inlineImages = inlineImageFiles.map((file) => {
      // originalname format: "<cid>::::<original_filename>"
      const separatorIndex = file.originalname.indexOf("::::");
      const contentId =
        separatorIndex >= 0
          ? file.originalname.substring(0, separatorIndex)
          : file.originalname;
      const filename =
        separatorIndex >= 0
          ? file.originalname.substring(separatorIndex + 4)
          : file.originalname;
      return {
        contentId,
        filename,
        mimeType: file.mimetype,
        content: file.buffer,
      };
    });
    const forwardAttachmentIds = this.parseForwardAttachmentIds(
      body.forwardAttachmentIds,
    );
    // A custom free-text follow-up window is parsed (identically to snooze)
    // into whole hours and overrides the preset expectedReplyHours value.
    const customDuration = body.expectedReplyDuration?.trim();
    let expectedReplyHours: number | undefined;
    if (customDuration) {
      expectedReplyHours = durationToHours(
        customDuration,
        new Date(),
        body.locale,
      );
    } else if (typeof body.expectedReplyHours === "string") {
      expectedReplyHours = parseInt(body.expectedReplyHours, 10);
    } else {
      ({ expectedReplyHours } = body);
    }
    const isForward =
      typeof body.isForward === "string"
        ? body.isForward === BOOLEAN_STRING_VALUES.TRUE
        : !!body.isForward;
    const keepInAction =
      typeof body.keepInAction === "string"
        ? body.keepInAction === BOOLEAN_STRING_VALUES.TRUE
        : !!body.keepInAction;

    if (body.scheduledSendAt) {
      return this.scheduleReply(req.user.userId, id, body, {
        attachments,
        forwardAttachmentIds,
        expectedReplyHours,
        isForward,
      });
    }

    await this.repliesService.sendReply(req.user.userId, id, body.reply, {
      attachments,
      inlineImages: inlineImages.length > 0 ? inlineImages : undefined,
      expectedReplyHours: isNaN(expectedReplyHours as number)
        ? undefined
        : expectedReplyHours,
      forwardAttachmentIds,
      recipients: body.recipients || undefined,
      cc: body.cc || undefined,
      bcc: body.bcc || undefined,
      subject: body.subject || undefined,
      isForward,
      keepInAction,
    });
    return { message: "Reply sent successfully" };
  }

  private parseForwardAttachmentIds(
    value: string | string[] | undefined,
  ): string[] | undefined {
    if (!value) return undefined;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [value];
    }
  }

  private async scheduleReply(
    userId: string,
    emailId: string,
    body: {
      reply: string;
      recipients?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      scheduledSendAt?: string;
      userTimezone?: string;
    },
    parsed: {
      attachments?: { filename: string; mimeType: string; content: Buffer }[];
      forwardAttachmentIds?: string[];
      expectedReplyHours?: number;
      isForward: boolean;
    },
  ) {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    decryptEmailEntityForApi(email);

    const subject =
      body.subject?.trim() ||
      buildReplySubject(email.subject, parsed.isForward);
    const replyToAddress = body.recipients?.trim()
      ? body.recipients
      : email.replyTo || email.from;
    const scheduledAttachments = parsed.attachments?.map((att) => ({
      filename: att.filename,
      mimeType: att.mimeType,
      content: att.content.toString("base64"),
    }));

    const scheduledEmail = await this.scheduledEmailsService.scheduleEmail(
      userId,
      {
        emailType: parsed.isForward ? "forward" : "reply",
        threadId: email.threadId,
        emailId,
        to: [{ email: replyToAddress, name: email.fromName }],
        cc: body.cc ? parseRecipientsFromString(body.cc) : undefined,
        bcc: body.bcc ? parseRecipientsFromString(body.bcc) : undefined,
        subject,
        body: body.reply,
        attachments: scheduledAttachments,
        scheduledSendAt: new Date(body.scheduledSendAt!),
        userTimezone: body.userTimezone,
        expectedReplyHours: isNaN(parsed.expectedReplyHours as number)
          ? undefined
          : parsed.expectedReplyHours,
        forwardAttachmentIds: parsed.forwardAttachmentIds,
      },
    );

    return {
      message: "Reply scheduled successfully",
      scheduledEmailId: scheduledEmail.id,
      scheduledSendAt: scheduledEmail.scheduledSendAt,
    };
  }
}
