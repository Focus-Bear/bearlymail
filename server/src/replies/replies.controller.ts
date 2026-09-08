import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
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
import { ERROR_MESSAGES } from "../constants/error-messages";
import { EmailSendQueueService } from "../email-send-queue/email-send-queue.service";
import {
  encodeAttachments,
  encodeInlineImages,
} from "../email-send-queue/queued-attachment.helpers";
import { EmailsService } from "../emails/emails.service";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { parseRecipientsFromString } from "../utils/email-address.utils";
import { resolveExpectedReplyHours } from "../utils/expected-reply.util";
import { buildReplySubject } from "../utils/reply-subject.util";
import { RepliesService, ReplyRule } from "./replies.service";
import { parseBooleanFlag, splitReplyUploads } from "./reply-upload.helpers";

@Controller("replies")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
export class RepliesController {
  constructor(
    private readonly repliesService: RepliesService,
    @Inject(forwardRef(() => ScheduledEmailsService))
    private readonly scheduledEmailsService: ScheduledEmailsService,
    private readonly emailsService: EmailsService,
    private readonly emailSendQueueService: EmailSendQueueService,
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

  /**
   * Accepts a reply/forward and hands it to the background send queue.
   *
   * The provider round-trip (and the thread bookkeeping that follows it) runs
   * in the worker, so this returns as soon as the message is durably persisted.
   * The client learns the real outcome from the `email-send-succeeded` /
   * `email-send-failed` Pusher event carrying the returned `sendId`.
   */
  @Post("send/:id")
  @HttpCode(HttpStatus.ACCEPTED)
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
    const { attachments, inlineImages } = splitReplyUploads(allFiles);
    const forwardAttachmentIds = this.parseForwardAttachmentIds(
      body.forwardAttachmentIds,
    );
    const expectedReplyHours = resolveExpectedReplyHours(body);
    const isForward = parseBooleanFlag(body.isForward);
    const keepInAction = parseBooleanFlag(body.keepInAction);

    if (body.scheduledSendAt) {
      return this.scheduleReply(req.user.userId, id, body, {
        attachments,
        forwardAttachmentIds,
        expectedReplyHours,
        isForward,
      });
    }

    // Validate up front — once the send is queued the only channel back to the
    // user is a Pusher failure event, so a bad email id should still 404 here.
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);

    const queued = await this.emailSendQueueService.queueReply(
      req.user.userId,
      id,
      {
        body: body.reply,
        attachments: encodeAttachments(attachments),
        inlineImages: encodeInlineImages(inlineImages),
        expectedReplyHours,
        forwardAttachmentIds,
        recipients: body.recipients || undefined,
        cc: body.cc || undefined,
        bcc: body.bcc || undefined,
        subject: body.subject || undefined,
        isForward,
        keepInAction,
      },
    );

    return {
      message: "Reply queued for sending",
      queued: true,
      sendId: queued.sendId,
      status: queued.status,
    };
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
        expectedReplyHours: parsed.expectedReplyHours,
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
