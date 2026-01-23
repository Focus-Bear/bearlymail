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
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RepliesService, ReplyRule } from "./replies.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("replies")
@UseGuards(JwtAuthGuard)
export class RepliesController {
  constructor(private readonly repliesService: RepliesService) {}

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
    @Body() body: { reply: string },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const attachments =
      files?.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      })) || undefined;

    await this.repliesService.sendReply(
      req.user.userId,
      id,
      body.reply,
      attachments,
    );
    return { message: "Reply sent successfully" };
  }
}
