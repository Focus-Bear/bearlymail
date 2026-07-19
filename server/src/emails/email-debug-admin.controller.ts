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
import type { PgBoss, QueueStats } from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DebugService } from "../debug/debug.service";
import { getJobPriority } from "../queue/job-priorities";
import { UpdateDebugConfigDto } from "./dto/update-debug-config.dto";
import { EmailAdminService } from "./email-admin.service";
import { getBossDb } from "./email-controller.helpers";
import { EmailDebugCategoryService } from "./email-debug-category.service";
import { EmailDebugPhishingService } from "./email-debug-phishing.service";
import { EmailDebugRawColumnsService } from "./email-debug-raw-columns.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import {
  CategoryFetchTrace,
  CategoryFetchTraceMode,
  EmailInboxTraceService,
} from "./email-inbox-trace.service";
import { EmailsService } from "./emails.service";

const VALID_TRACE_MODES: readonly CategoryFetchTraceMode[] = [
  "triage",
  "action",
  "follow-up",
];

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class EmailDebugAdminController {
  private readonly logger = new Logger(EmailDebugAdminController.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailAdminService: EmailAdminService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly debugService: DebugService,
    private readonly emailInboxTraceService: EmailInboxTraceService,
    private readonly rawColumnsService: EmailDebugRawColumnsService,
    private readonly emailFollowUpService: EmailFollowUpService,
    private readonly emailDebugCategoryService: EmailDebugCategoryService,
    private readonly phishingDebugService: EmailDebugPhishingService,
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
    // Reset jobs that are stuck in retry state with future startafter times.
    // getQueueStats() reports the number of queued (created/retry) jobs.
    // pg-boss v12 returns an array of snapshots (newest last); take the most
    // recent live count.
    const latestQueuedCount = (stats: QueueStats[]): number =>
      stats.length > 0 ? (stats[stats.length - 1]?.queuedCount ?? 0) : 0;
    const [priorityStats, summaryStats, syncStats] = await Promise.all([
      this.boss.getQueueStats(JOB_NAMES.REFINE_PRIORITY),
      this.boss.getQueueStats(JOB_NAMES.GENERATE_SUMMARY),
      this.boss.getQueueStats(JOB_NAMES.SYNC_EMAILS),
    ]);
    const stuckJobs = latestQueuedCount(priorityStats);
    const stuckSummary = latestQueuedCount(summaryStats);
    const stuckSync = latestQueuedCount(syncStats);

    // Use raw SQL to reset startafter for stuck jobs
    const result = await getBossDb(this.boss).executeSql(`
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

  @Get(":id/debug/raw-columns")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getRawColumns(@Param("id") id: string) {
    return this.rawColumnsService.getRawColumns(id);
  }

  @Get(":id/debug/github-scan")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async scanGitHubLinks(@Param("id") id: string) {
    return this.rawColumnsService.scanGitHubLinks(id);
  }

  /**
   * Snapshot the Follow-Up filter inputs for one email (issue #2125).
   * Answers "why is (or isn't) this thread in Follow Up mode?" — returns
   * thread snooze/star state, FollowUp record(s), reply history and a
   * verdict with per-criterion reasons.
   */
  @Get(":id/debug/follow-up-status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getFollowUpStatus(@Request() req, @Param("id") id: string) {
    return this.emailFollowUpService.getFollowUpDebugInfo(req.user.userId, id);
  }

  /**
   * Explain the phishing verdict for one email — returns the stored LLM
   * confidence/reason, the keyword/domain signals that fed it, and a
   * display-name vs sender-domain impersonation check. Diagnoses why a
   * spoofed email (e.g. "SendGrid" sent from a mismatched domain) slipped
   * through.
   */
  @Get(":id/debug/phishing")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getPhishingDebug(@Param("id") id: string) {
    return this.phishingDebugService.getPhishingDebugInfo(id);
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

  /**
   * Per-stage trace of the inbox category fetch pipeline (issue #1954).
   *
   * Replays runInboxQuery → blocked-sender filter → category filter → mode
   * filter for a single (categoryId, mode) pair and returns the thread IDs
   * present at each stage plus the reason every dropped thread was excluded.
   * Use this to diagnose accordions that show count > 0 but render no emails.
   *
   * categoryId of "uncategorized" or "Other" traces the null-category bucket.
   */
  /**
   * Lists every EMAIL_CATEGORY UserContext for the caller, with both raw
   * `contextValue` and parsed name/description, grouped by parsed name so
   * duplicate rows are obvious at a glance. Used by the inbox admin debug
   * panel to diagnose ghost-empty categories (issue #2062).
   */
  @Get("debug/category-contexts")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listCategoryContexts(@Request() req) {
    return this.emailDebugCategoryService.listEmailCategoryContexts(
      req.user.userId,
    );
  }

  @Get("debug/category-fetch-trace")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async traceCategoryFetch(
    @Request() req,
    @Query("categoryId") categoryId?: string,
    @Query("mode") mode?: string,
  ): Promise<CategoryFetchTrace> {
    if (!categoryId) {
      throw new BadRequestException(
        "Missing required query parameter: categoryId",
      );
    }
    const resolvedMode = (
      VALID_TRACE_MODES.includes(mode as CategoryFetchTraceMode)
        ? mode
        : "triage"
    ) as CategoryFetchTraceMode;
    return this.emailInboxTraceService.traceCategoryFetch(
      req.user.userId,
      categoryId,
      resolvedMode,
    );
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

  /**
   * On-demand trigger for the local-model training-data feed: enqueues a
   * per-user export to `training-data/<userId>.json` instead of waiting for the
   * weekly cron. Targets `body.userId` (a real user with enough history — admin
   * accounts rarely clear the record threshold), defaulting to the caller.
   * Bootstraps/validates the training loop; run the training task afterwards.
   */
  @Post("admin/export-training-data")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async exportTrainingData(@Request() req, @Body() body: { userId?: string }) {
    const targetUserId = body.userId || req.user.userId;
    await this.boss.send(
      JOB_NAMES.EXPORT_TRAINING_DATA,
      { userId: targetUserId },
      {
        priority: getJobPriority(JOB_NAMES.EXPORT_TRAINING_DATA),
        singletonKey: `export-training-data-${targetUserId}`,
      },
    );
    return { enqueued: true, userId: targetUserId };
  }
}
