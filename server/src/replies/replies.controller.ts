import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RepliesService, ReplyRule } from "./replies.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { EmailsService } from "../emails/emails.service";

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
      expectedReplyHours?: number | string;
      forwardAttachmentIds?: string | string[];
      scheduledSendAt?: string;
      userTimezone?: string;
    },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const attachments =
      files?.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      })) || undefined;

    // Parse forwardAttachmentIds - it may come as JSON string from FormData
    let forwardAttachmentIds: string[] | undefined;
    if (body.forwardAttachmentIds) {
      if (typeof body.forwardAttachmentIds === "string") {
        try {
          forwardAttachmentIds = JSON.parse(body.forwardAttachmentIds);
        } catch {
          forwardAttachmentIds = [body.forwardAttachmentIds];
        }
      } else {
        ({ forwardAttachmentIds } = body);
      }
    }

    // Parse expectedReplyHours - it may come as string from FormData
    const expectedReplyHours =
      typeof body.expectedReplyHours === "string"
        ? parseInt(body.expectedReplyHours, 10)
        : body.expectedReplyHours;

    // If scheduled send time is provided, create scheduled email instead of sending immediately
    if (body.scheduledSendAt) {
      const scheduledSendAt = new Date(body.scheduledSendAt);

      // Get email details for scheduling
      const email = await this.emailsService.getEmailById(req.user.userId, id);
      if (!email) {
        throw new Error("Email not found");
      }

      // Determine reply subject (add Re: if not already present)
      let replySubject = email.subject;
      if (!replySubject.toLowerCase().startsWith("re:")) {
        replySubject = `Re: ${replySubject}`;
      }

      // Use provided recipients if available (reply-all), otherwise fall back to Reply-To or From address
      const replyToAddress =
        body.recipients && body.recipients.trim()
          ? body.recipients
          : email.replyTo || email.from;

      // Convert attachments to base64 for storage
      const scheduledAttachments = attachments?.map((att) => ({
        filename: att.filename,
        mimeType: att.mimeType,
        content: att.content.toString("base64"),
      }));

      const scheduledEmail = await this.scheduledEmailsService.scheduleEmail(
        req.user.userId,
        {
          emailType: "reply",
          threadId: email.threadId,
          emailId: id,
          to: [{ email: replyToAddress, name: email.fromName }],
          subject: replySubject,
          body: body.reply,
          attachments: scheduledAttachments,
          scheduledSendAt,
          userTimezone: body.userTimezone,
          expectedReplyHours: isNaN(expectedReplyHours as number)
            ? undefined
            : expectedReplyHours,
          forwardAttachmentIds,
        },
      );

      return {
        message: "Reply scheduled successfully",
        scheduledEmailId: scheduledEmail.id,
        scheduledSendAt: scheduledEmail.scheduledSendAt,
      };
    }

    // Otherwise send immediately
    await this.repliesService.sendReply(req.user.userId, id, body.reply, {
      attachments,
      expectedReplyHours: isNaN(expectedReplyHours as number)
        ? undefined
        : expectedReplyHours,
      forwardAttachmentIds,
      recipients: body.recipients || undefined,
      cc: body.cc || undefined,
    });
    return { message: "Reply sent successfully" };
  }
}
