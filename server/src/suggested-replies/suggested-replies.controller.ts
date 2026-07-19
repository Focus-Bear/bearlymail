import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { SuggestedRepliesService } from "./suggested-replies.service";

@Controller("suggested-replies")
@UseGuards(JwtAuthGuard)
export class SuggestedRepliesController {
  constructor(
    private readonly suggestedRepliesService: SuggestedRepliesService,
  ) {}

  @Get(":threadId")
  async getSuggestedReplies(
    @Request() req,
    @Param("threadId") threadId: string,
  ) {
    const suggestedReply =
      await this.suggestedRepliesService.getSuggestedReplies(
        req.user.userId,
        threadId,
      );

    if (!suggestedReply) {
      return { options: null, isGenerating: false };
    }

    return {
      options: suggestedReply.options,
      isGenerating: suggestedReply.isGenerating,
      lastEmailId: suggestedReply.lastEmailId,
      updatedAt: suggestedReply.updatedAt,
    };
  }

  @Post(":threadId/regenerate")
  @UseGuards(AiCapacityGuard)
  async regenerateSuggestedReplies(
    @Request() req,
    @Param("threadId") threadId: string,
  ) {
    const suggestedReply =
      await this.suggestedRepliesService.getSuggestedReplies(
        req.user.userId,
        threadId,
      );

    if (suggestedReply?.lastEmailId) {
      await this.suggestedRepliesService.queueSuggestedReplyGeneration(
        req.user.userId,
        threadId,
        suggestedReply.lastEmailId,
      );
    }

    return { queued: true };
  }

  @Post(":threadId/ensure")
  @UseGuards(AiCapacityGuard)
  async ensureSuggestedReplies(
    @Request() req,
    @Param("threadId") threadId: string,
  ) {
    return this.suggestedRepliesService.ensureSuggestedReplies(
      req.user.userId,
      threadId,
    );
  }
}
