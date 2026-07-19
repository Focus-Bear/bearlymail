import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DraftsService } from "./drafts.service";

@Controller("drafts")
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get("thread/:threadId")
  async getDraftByThread(@Request() req, @Param("threadId") threadId: string) {
    return this.draftsService.getDraftByThread(req.user.userId, threadId);
  }

  @Post("thread/:threadId")
  async saveDraft(
    @Request() req,
    @Param("threadId") threadId: string,
    @Body()
    body: {
      content: string;
      replyMode?: "reply" | "replyAll";
      recipients?: string;
    },
  ) {
    return this.draftsService.saveDraft(
      req.user.userId,
      threadId,
      body.content,
      body.replyMode || "reply",
      body.recipients,
    );
  }

  @Delete("thread/:threadId")
  async deleteDraft(@Request() req, @Param("threadId") threadId: string) {
    await this.draftsService.deleteDraft(req.user.userId, threadId);
    return { message: "Draft deleted" };
  }

  @Delete(":id")
  async deleteDraftById(@Request() req, @Param("id") id: string) {
    await this.draftsService.deleteDraftById(req.user.userId, id);
    return { message: "Draft deleted" };
  }
}
