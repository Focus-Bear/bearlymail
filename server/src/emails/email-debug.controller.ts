import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import PgBoss from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { GmailRequiredGuard } from "../auth/gmail-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JOB_NAMES } from "../constants/job-names";
import { EmailAdminService } from "./email-admin.service";
import { PgBossWithInternals } from "./email-controller.helpers";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, GmailRequiredGuard, AdminGuard)
export class EmailDebugController {
  private readonly logger = new Logger(EmailDebugController.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailAdminService: EmailAdminService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
  ) {}

  @Get("debug/sync-status")
  async getSyncStatus(@Request() req) {
    return this.emailsService.getSyncStatus(req.user.userId);
  }

  @Get("debug/sync-history")
  async getSyncHistory(@Request() req, @Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.emailsService.getSyncHistory(
      req.user.userId,
      parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get("debug/starred-threads")
  async debugStarredThreads(@Request() req) {
    return this.emailsService.debugStarredThreads(req.user.userId);
  }

  @Get("debug/orphan-emails")
  async debugOrphanEmails(@Request() req) {
    return this.emailsService.debugOrphanEmails(req.user.userId);
  }

  @Post("debug/fix-orphan-emails")
  async fixOrphanEmails(@Request() req) {
    return this.emailsService.fixOrphanEmails(req.user.userId);
  }

  @Post("debug/reset-stuck-jobs")
  async resetStuckJobs(@Request() _req) {
    const bossInternal = this.boss as unknown as PgBossWithInternals;
    const stuckJobs = await bossInternal.getQueueSize(
      JOB_NAMES.REFINE_PRIORITY,
    );
    const stuckSummary = await bossInternal.getQueueSize(
      JOB_NAMES.GENERATE_SUMMARY,
    );
    const stuckSync = await bossInternal.getQueueSize(JOB_NAMES.SYNC_EMAILS);

    const result = await bossInternal.db.executeSql(`
      UPDATE pgboss.job
      SET startafter = NOW(), retrycount = 0
      WHERE state = 'retry'
      AND startafter > NOW()
      AND name IN ('refine-priority', 'generate-summary', 'sync-emails', 'learn-from-star')
    `);

    return {
      message: "Reset stuck jobs",
      queueSizes: {
        [JOB_NAMES.REFINE_PRIORITY]: stuckJobs,
        [JOB_NAMES.GENERATE_SUMMARY]: stuckSummary,
        [JOB_NAMES.SYNC_EMAILS]: stuckSync,
      },
      resetCount: result?.rowCount || 0,
    };
  }

  @Post("debug/fix-stuck-calculating")
  async fixStuckCalculating(@Request() req) {
    return this.emailsService.fixStuckCalculatingThreads(req.user.userId);
  }

  @Post("debug/fix-stale-unsynced")
  async fixStaleUnsynced(@Request() req) {
    return this.emailsService.fixStaleUnsyncedThreads(req.user.userId);
  }

  /**
   * Fix #1571 Item 3: Priority debug info endpoint.
   * Returns per-mode bucket counts, priority score histogram, and fetch timestamp.
   */
  @Get("debug/priority-info")
  async getPriorityDebugInfo(@Request() req) {
    return this.emailsService.getPriorityDebugInfo(req.user.userId);
  }

  @Get("debug/thread-lookup/:threadId")
  async lookupThread(@Request() req, @Param("threadId") threadId: string) {
    const gmailUrlPattern = /^https?:\/\/mail\.google\.com\/mail\//i;
    if (gmailUrlPattern.test(threadId)) {
      this.logger.log(`Detected Gmail URL, using Gmail URL lookup`);
      return this.emailsService.lookupByGmailUrl(req.user.userId, threadId);
    }

    const messageIdResult = await this.emailsService.lookupByMessageId(
      req.user.userId,
      threadId,
    );
    if (messageIdResult.found) {
      return messageIdResult;
    }

    return this.emailsService.lookupThread(req.user.userId, threadId);
  }

  @Get(":id/debug/category")
  async getCategoryDebugData(@Request() req, @Param("id") id: string) {
    return this.emailsService.getCategoryDebugData(req.user.userId, id);
  }

  @Get("admin/job-stats")
  async getJobStats(
    @Request() _req,
    @Query("range") range: "24h" | "7d" | "30d" | "all" = "all",
  ) {
    return this.emailAdminService.getJobStats(range);
  }
}
