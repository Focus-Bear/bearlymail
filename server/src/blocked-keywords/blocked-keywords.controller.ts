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
import { BlockedKeywordsService } from "./blocked-keywords.service";

@Controller("blocked-keywords")
@UseGuards(JwtAuthGuard)
export class BlockedKeywordsController {
  constructor(
    private readonly blockedKeywordsService: BlockedKeywordsService,
  ) {}

  /**
   * Get all blocked keywords
   */
  @Get()
  async getBlockedKeywords(@Request() req) {
    return this.blockedKeywordsService.getBlockedKeywords(req.user.userId);
  }

  /**
   * Block a keyword
   */
  @Post()
  async blockKeyword(
    @Request() req,
    @Body()
    body: {
      keyword: string;
      exactMatch?: boolean;
      reason?: string;
    },
  ) {
    const blocked = await this.blockedKeywordsService.blockKeyword(
      req.user.userId,
      body.keyword,
      body.exactMatch,
      body.reason,
    );
    return {
      id: blocked.id,
      keyword: blocked.keyword,
      exactMatch: blocked.exactMatch,
      reason: blocked.reason,
      blockedAt: blocked.blockedAt,
    };
  }

  /**
   * Unblock a keyword by ID
   */
  @Delete(":id")
  async unblockKeyword(@Request() req, @Param("id") id: string) {
    await this.blockedKeywordsService.unblockKeyword(req.user.userId, id);
    return { success: true };
  }

  /**
   * Check if a subject contains blocked keywords
   */
  @Post("check")
  async checkBlocked(@Request() req, @Body() body: { subject: string }) {
    const matchedKeyword =
      await this.blockedKeywordsService.checkSubjectForBlockedKeywords(
        req.user.userId,
        body.subject,
      );
    return {
      isBlocked: !!matchedKeyword,
      matchedKeyword: matchedKeyword?.keyword || null,
    };
  }
}
