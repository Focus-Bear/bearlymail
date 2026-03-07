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
import { FilesInterceptor } from "@nestjs/platform-express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EmailsService } from "../emails/emails.service";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { parseRecipientsFromString } from "../utils/email-address.utils";
import { RepliesService, ReplyRule } from "./replies.service";

@Controller("replies")
@UseGuards(JwtAuthGuard)
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
  @UseInterceptors(FilesInterceptor("files", 10))
  async sendReply(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      reply: string;
      recipients?: string;
      cc?: string;
      bcc?: string;
      replyAll?: boolean | string;
      isForward?: boolean | string;
      expectedReplyHours?: number | string;
      forwardAttachmentIds?: string | string[];
      scheduledSendAt?: string;
      userTimezone?: string;
    },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const attachments = files?.map((file) => ({
      filename: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
    }));
    const forwardAttachmentIds = this.parseForwardAttachmentIds(
      body.forwardAttachmentIds,
    );
    const expectedReplyHours =
      typeof body.expectedReplyHours === "string"
        ? parseInt(body.expectedReplyHours, 10)
        : body.expectedReplyHours;
    const isForward =
      typeof body.isForward === "string"
        ? body.isForward === "true"
        : !!body.isForward;

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
      expectedReplyHours: isNaN(expectedReplyHours as number)
        ? undefined
        : expectedReplyHours,
      forwardAttachmentIds,
      recipients: body.recipients || undefined,
      cc: body.cc || undefined,
      bcc: body.bcc || undefined,
      isForward,
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

  private buildScheduledSubject(subject: string, isForward: boolean): string {
    if (isForward) {
      return subject.toLowerCase().startsWith("fwd:")
        ? subject
        : `Fwd: ${subject}`;
    }
    return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  }

  private async scheduleReply(
    userId: string,
    emailId: string,
    body: {
      reply: string;
      recipients?: string;
      cc?: string;
      bcc?: string;
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
    if (!email) throw new Error("Email not found");

    const subject = this.buildScheduledSubject(email.subject, parsed.isForward);
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
