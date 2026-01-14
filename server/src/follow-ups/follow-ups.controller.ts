import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FollowUpsService } from "./follow-ups.service";
import { Inject } from "@nestjs/common";
import PgBoss = require("pg-boss");
import { QUERY_LIMITS } from "../constants/query-limits";

@Controller("follow-ups")
@UseGuards(JwtAuthGuard)
export class FollowUpsController {
  constructor(
    private followUpsService: FollowUpsService,
    @Inject("PG_BOSS") private boss: PgBoss,
  ) {}

  /**
   * Get all follow-ups that need action (due for follow-up)
   */
  @Get("due")
  async getDueFollowUps(@Request() req) {
    return this.followUpsService.getDueFollowUps(req.user.userId);
  }

  /**
   * Get all follow-ups that are awaiting reply (not yet due)
   */
  @Get("awaiting")
  async getAwaitingFollowUps(@Request() req) {
    return this.followUpsService.getAwaitingReplyFollowUps(req.user.userId);
  }

  /**
   * Generate follow-up drafts for all due follow-ups
   */
  @Post("generate-drafts")
  async generateDrafts(@Request() req) {
    return this.followUpsService.generateFollowUpDrafts(req.user.userId);
  }

  /**
   * Create a new follow-up reminder
   */
  @Post()
  async createFollowUp(
    @Request() req,
    @Body()
    body: { threadId: string; followUpDays: number; sentEmailId?: string },
  ) {
    return this.followUpsService.createFollowUp(
      req.user.userId,
      body.threadId,
      body.followUpDays,
      body.sentEmailId,
    );
  }

  /**
   * Update a follow-up draft
   */
  @Put(":id/draft")
  async updateDraft(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { draft: string },
  ) {
    return this.followUpsService.updateDraft(id, req.user.userId, body.draft);
  }

  /**
   * Review and clean up a follow-up draft before sending
   */
  @Post(":id/review-draft")
  async reviewDraft(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { draft: string; recipientName?: string },
  ) {
    const reviewedDraft = await this.followUpsService.reviewAndCleanupDraft(
      id,
      req.user.userId,
      body.draft,
      body.recipientName,
    );
    return reviewedDraft;
  }

  /**
   * Mark a follow-up as completed (sent)
   */
  @Post(":id/complete")
  async completeFollowUp(@Request() req, @Param("id") id: string) {
    await this.followUpsService.completeFollowUp(id, req.user.userId);
    return { success: true };
  }

  /**
   * Cancel a follow-up
   */
  @Delete(":id")
  async cancelFollowUp(@Request() req, @Param("id") id: string) {
    await this.followUpsService.cancelFollowUp(id, req.user.userId);
    return { success: true };
  }

  /**
   * Generate drafts for threads in view
   */
  @Post("generate-drafts-for-threads")
  async generateDraftsForThreads(
    @Request() req,
    @Body() body: { threadIds: string[] },
  ) {
    if (!body.threadIds || !Array.isArray(body.threadIds)) {
      throw new BadRequestException("threadIds must be an array");
    }

    await this.followUpsService.generateDraftsForThreads(
      req.user.userId,
      body.threadIds,
    );
    return { success: true, message: "Draft generation queued" };
  }

  /**
   * Bulk send follow-ups (max 20)
   */
  @Post("bulk-send")
  async bulkSend(@Request() req, @Body() body: { followUpIds: string[] }) {
    if (!body.followUpIds || !Array.isArray(body.followUpIds)) {
      throw new BadRequestException("followUpIds must be an array");
    }

    if (body.followUpIds.length > QUERY_LIMITS.MAX_RESULTS_DEFAULT) {
      throw new BadRequestException(
        `Maximum ${QUERY_LIMITS.MAX_RESULTS_DEFAULT} follow-ups allowed per bulk send`,
      );
    }

    if (body.followUpIds.length === 0) {
      throw new BadRequestException("At least one follow-up ID required");
    }

    // Queue background job
    const job = await this.boss.send("bulk-send-follow-ups", {
      userId: req.user.userId,
      followUpIds: body.followUpIds,
    });

    return {
      success: true,
      jobId: job,
      message: "Bulk send queued",
    };
  }

  /**
   * Get threads in follow-up mode with draft status
   * NOTE: This route must come BEFORE @Get(":id") to avoid route conflicts
   */
  @Get("threads")
  async getThreadsWithDrafts(@Request() req) {
    const threads = await this.followUpsService.getThreadsForFollowUp(
      req.user.userId,
    );

    // Get follow-ups for these threads
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const threadIds = threads.map((t) => t.threadId);
    const followUps = await this.followUpsService.getDueFollowUps(
      req.user.userId,
    );

    // Map follow-ups by threadId
    const followUpMap = new Map(followUps.map((fu) => [fu.threadId, fu]));

    // Combine threads with follow-up data
    return threads.map((thread) => {
      const followUp = followUpMap.get(thread.threadId);
      return {
        ...thread,
        // Include follow-up metadata from email object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastTheirReplyAt: (thread as any).lastTheirReplyAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastMyReplyAt: (thread as any).lastMyReplyAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        otherPersonName: (thread as any).otherPersonName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        otherPersonEmail: (thread as any).otherPersonEmail,
        followUp: followUp
          ? {
              id: followUp.id,
              draftFollowUp: followUp.draftFollowUp,
              generationStatus: followUp.generationStatus,
              generationError: followUp.generationError,
              sendStatus: followUp.sendStatus,
              sendError: followUp.sendError,
            }
          : null,
      };
    });
  }

  /**
   * Get a single follow-up
   * NOTE: This route must come AFTER specific routes like @Get("threads")
   */
  @Get(":id")
  async getFollowUp(@Request() req, @Param("id") id: string) {
    return this.followUpsService.getFollowUp(id, req.user.userId);
  }

  /**
   * Get generation/send status for a follow-up
   */
  @Get(":id/status")
  async getFollowUpStatus(@Request() req, @Param("id") id: string) {
    const followUp = await this.followUpsService.getFollowUp(
      id,
      req.user.userId,
    );
    if (!followUp) {
      throw new BadRequestException("Follow-up not found");
    }    return {
      generationStatus: followUp.generationStatus,
      generationError: followUp.generationError,
      sendStatus: followUp.sendStatus,
      sendError: followUp.sendError,
    };
  }
}
