/**
 * EmailDebugAdminController
 *
 * Houses all /emails/debug/* and /emails/admin/* endpoints, plus the
 * recategorization helpers that are primarily used by admins/developers.
 *
 * Extracted from emails.controller.ts (issue #1460) to keep that file
 * under the 800-line lint budget.
 */

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
import { PgBossWithInternals } from "./email-controller.helpers";
import { EmailAdminService } from "./email-admin.service";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, GmailRequiredGuard)
export class EmailDebugAdminController {
  private readonly logger = new Logger(EmailDebugAdminController.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailAdminService: EmailAdminService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
  ) {}

  // ─── Recategorization ────────────────────────────────────────────────────────

  @Get("recategorize-progress")
  async getRecategorizeProgress(
    @Request() req,
    @Query("batchId") batchId: string,
  ) {
    const { userId } = req.user;
    return this.emailAdminService.getRecategorizationProgress(userId, batchId);
  }

  @Post("recategorize-triage")
  async recategorizeTriageEmails(
    @Request() req,
    @Query("modes") modesParam?: string,
  ) {
    return this.emailAdminService.queueBulkRecategorization(
      req.user.userId,
      modesParam,
    );
  }

  // ─── Debug endpoints ─────────────────────────────────────────────────────────

  @Get("debug/sync-status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getSyncStatus(@Request() req) {
    return this.emailsService.getSyncStatus(req.user.userId);
  }

  @Get("debug/sync-history")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getSyncHistory(@Request() req, @Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.emailsService.getSyncHistory(
      req.user.userId,
      parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get("debug/starred-threads")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async debugStarredThreads(@Request() req) {
    return this.emailsService.debugStarredThreads(req.user.userId);
  }

  @Get("debug/orphan-emails")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async debugOrphanEmails(@Request() req) {
    return this.emailsService.debugOrphanEmails(req.user.userId);
  }

  @Post("debug/fix-orphan-emails")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async fixOrphanEmails(@Request() req) {
    return this.emailsService.fixOrphanEmails(req.user.userId);
  }

  @Post("debug/reset-stuck-jobs")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async resetStuckJobs(@Request() _req) {
    // Reset jobs that are stuck in retry state with future startafter times
    // Cast to extended interface to access internal pg-boss methods
    const bossInternal = this.boss as unknown as PgBossWithInternals;
    const stuckJobs = await bossInternal.getQueueSize(
      JOB_NAMES.REFINE_PRIORITY,
    );
    const stuckSummary = await bossInternal.getQueueSize(
      JOB_NAMES.GENERATE_SUMMARY,
    );
    const stuckSync = await bossInternal.getQueueSize(JOB_NAMES.SYNC_EMAILS);

    // Use raw SQL to reset startafter for stuck jobs
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
  @UseGuards(JwtAuthGuard, AdminGuard)
  async fixStuckCalculating(@Request() req) {
    return this.emailsService.fixStuckCalculatingThreads(req.user.userId);
  }

  @Post("debug/fix-stale-unsynced")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async fixStaleUnsynced(@Request() req) {
    return this.emailsService.fixStaleUnsyncedThreads(req.user.userId);
  }

  @Get("debug/thread-lookup/:threadId")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async lookupThread(@Request() req, @Param("threadId") threadId: string) {
    // Check if the input is a Gmail URL — use the dedicated Gmail URL lookup which
    // handles the base64url-encoded URL IDs used in Gmail's web interface (these differ
    // from the hexadecimal IDs used by the Gmail REST API).
    const gmailUrlPattern = /^https?:\/\/mail\.google\.com\/mail\//i;
    if (gmailUrlPattern.test(threadId)) {
      this.logger.log(`Detected Gmail URL, using Gmail URL lookup`);
      return this.emailsService.lookupByGmailUrl(req.user.userId, threadId);
    }

    // Otherwise treat it as a thread ID or message ID
    // Try message ID lookup first (since it's more specific)
    const messageIdResult = await this.emailsService.lookupByMessageId(
      req.user.userId,
      threadId,
    );
    if (messageIdResult.found) {
      return messageIdResult;
    }

    // Fall back to thread ID lookup
    return this.emailsService.lookupThread(req.user.userId, threadId);
  }

  @Get(":id/debug/category")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getCategoryDebugData(@Request() req, @Param("id") id: string) {
    return this.emailsService.getCategoryDebugData(req.user.userId, id);
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────────

  @Get("admin/job-stats")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getJobStats(
    @Request() _req,
    @Query("range") range: "24h" | "7d" | "30d" | "all" = "all",
  ) {
    return this.emailAdminService.getJobStats(range);
  }
}
