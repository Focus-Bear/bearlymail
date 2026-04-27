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
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import PgBoss from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DebugService } from "../debug/debug.service";
import { UpdateDebugConfigDto } from "./dto/update-debug-config.dto";
import { EmailAdminService } from "./email-admin.service";
import { PgBossWithInternals } from "./email-controller.helpers";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class EmailDebugAdminController {
  private readonly logger = new Logger(EmailDebugAdminController.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailAdminService: EmailAdminService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly debugService: DebugService,
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
  async getCategoryDebugData(
    @Request() req,
    @Param("id") id: string,
    @Query("deep") deep?: string,
  ) {
    const wantDeep = deep === "1" || deep === BOOLEAN_STRING_VALUES.TRUE;
    return this.emailsService.getCategoryDebugData(req.user.userId, id, {
      deep: wantDeep,
    });
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

  // ─── Debug config/data endpoints (issue #1595) ───────────────────────────────

  /** List all debug feature configs. */
  @Get("admin/debug/configs")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getDebugConfigs() {
    return this.debugService.getAllConfigs();
  }

  /** Toggle a debug feature on/off, or update retentionDays. */
  @Patch("admin/debug/configs/:feature")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateDebugConfig(
    @Param("feature") feature: string,
    @Body() body: UpdateDebugConfigDto,
  ) {
    await this.debugService.updateDebugConfig(feature, {
      enabled: body.enabled,
      retentionDays: body.retentionDays,
    });
    const configs = await this.debugService.getAllConfigs();
    const config = configs.find((cfg) => cfg.feature === feature);
    if (!config) {
      throw new NotFoundException(`Debug feature '${feature}' not found`);
    }
    return config;
  }

  /** Query debug data for a feature with optional pagination. */
  @Get("admin/debug/data/:feature")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getDebugData(
    @Param("feature") feature: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("userId") userId?: string,
  ) {
    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : undefined;
    const parsedOffset =
      offset !== undefined ? parseInt(offset, 10) : undefined;

    if (parsedLimit !== undefined && isNaN(parsedLimit)) {
      throw new BadRequestException(
        `Invalid query parameter: limit="${limit}"`,
      );
    }
    if (parsedOffset !== undefined && isNaN(parsedOffset)) {
      throw new BadRequestException(
        `Invalid query parameter: offset="${offset}"`,
      );
    }

    return this.debugService.queryData(feature, {
      limit: parsedLimit,
      offset: parsedOffset,
      userId,
    });
  }

  /**
   * Aggregated redundancy detection summary for a feature.
   * Groups by threadId + emailCount and shows cases where count > 1.
   * Raw SQL is encapsulated in DebugService.getRedundancySummary().
   */
  @Get("admin/debug/data/:feature/summary")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getDebugDataSummary(@Param("feature") feature: string) {
    return this.debugService.getRedundancySummary(feature);
  }

  /** Manual cleanup of all debug data for a feature. */
  @Delete("admin/debug/data/:feature")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteDebugData(@Param("feature") feature: string) {
    const deleted = await this.debugService.deleteFeatureData(feature);
    return { feature, deleted };
  }
}
