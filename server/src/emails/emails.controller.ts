/**
 * EmailsController
 *
 * Core email CRUD, inbox views, and instant search.
 *
 * Endpoint groups that live in dedicated controllers:
 *   - /emails/send, /emails/:id/accelerate, /emails/recategorize-triage
 *       → EmailSendController (email-send.controller.ts)
 *   - /emails/search/rank, /emails/search/expand
 *       → EmailSearchOpsController (email-search-ops.controller.ts)
 *   - /emails/debug/*, /emails/admin/*
 *       → EmailDebugController (email-debug.controller.ts)
 *       → EmailDebugAdminController (email-debug-admin.controller.ts)
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
  Post,
  Put,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import PgBoss from "pg-boss";

import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { isUuid } from "../common/uuid.utils";
import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { Email } from "../database/entities/email.entity";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { getJobPriority } from "../queue/job-priorities";
import { EmailAdminService } from "./email-admin.service";
import {
  BatchStatusPerformanceTracker,
  EMAIL_CONTROLLER_DEFAULTS,
} from "./email-controller.helpers";
import { EmailExportService } from "./email-export.service";
import {
  CategoryOverrideBody,
  ExportEmailBody,
  InboxQuery,
  InboxSummaryQuery,
} from "./emails.controller.types";
import { EmailsService } from "./emails.service";
import { GmailProvider } from "./providers/gmail.provider";
import { SearchEnrichmentService } from "./search-enrichment.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class EmailsController {
  private readonly logger = new Logger(EmailsController.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly batchScheduleService: BatchScheduleService,
    private readonly emailAdminService: EmailAdminService,
    private readonly gmailProvider: GmailProvider,
    private readonly searchEnrichmentService: SearchEnrichmentService,
    private readonly emailExportService: EmailExportService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  // ---------------------------------------------------------------------------
  // Inbox
  // ---------------------------------------------------------------------------

  @Get("inbox")
  async getInbox(@Request() req, @Query() query: InboxQuery) {
    const {
      includeBatched,
      mode = "triage",
      accounts,
      categoryIds,
      minPriority,
      maxPriority,
      page: pageParam,
      limit: limitParam,
      offset: offsetParam,
      assigneeId,
    } = query;
    const accountIds = accounts
      ? accounts.split(",").filter(Boolean)
      : undefined;
    const categoryIdList = categoryIds
      ? categoryIds.split(",").filter(Boolean)
      : undefined;
    const minPriorityValue =
      minPriority !== undefined && minPriority !== ""
        ? parseFloat(minPriority)
        : undefined;
    const maxPriorityValue =
      maxPriority !== undefined && maxPriority !== ""
        ? parseFloat(maxPriority)
        : undefined;

    const pageSize = limitParam
      ? Math.max(1, parseInt(limitParam, 10))
      : QUERY_LIMITS.INBOX_PAGE_SIZE;
    const pageNum = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const offset =
      offsetParam !== undefined
        ? Math.max(0, parseInt(offsetParam, 10))
        : (pageNum - 1) * pageSize;

    const result = await this.emailsService.getInbox(
      req.user.userId,
      includeBatched === BOOLEAN_STRING_VALUES.TRUE,
      mode,
      {
        accountIds,
        categoryIds: categoryIdList,
        minPriority: minPriorityValue,
        maxPriority: maxPriorityValue,
        assigneeId,
      },
      { offset, limit: pageSize },
    );

    return {
      emails: result.emails,
      total: result.total,
      hasMore: result.hasMore,
      page: pageNum,
      limit: pageSize,
    };
  }

  @Get("connected-accounts")
  async getConnectedAccounts(@Request() req) {
    return this.emailsService.getConnectedAccounts(req.user.userId);
  }

  @Get("categories")
  async getCategories(@Request() req) {
    // @deprecated — only kept because CategoryOverrideModal still consumes it.
    // The inbox filter bar no longer falls back to this endpoint; it uses inbox-summary instead.
    // Remove this endpoint once CategoryOverrideModal is migrated to use inbox-summary.
    return this.emailsService.getCategories(req.user.userId);
  }

  /**
   * Returns priority tier counts for a given inbox mode.
   *
   * Fix #1452 bug 3: accepts optional `mode` query param (triage|action|follow-up).
   * Defaults to "triage" to match the primary use case (progressive unlock prompt).
   */
  @Get("priority-counts")
  async getPriorityCounts(@Request() req, @Query("mode") mode?: string) {
    const validModes = ["triage", "action", "follow-up"] as const;
    type ValidMode = (typeof validModes)[number];
    const resolvedMode: ValidMode = validModes.includes(mode as ValidMode)
      ? (mode as ValidMode)
      : "triage";
    return this.emailsService.getPriorityCounts(req.user.userId, resolvedMode);
  }

  /**
   * Returns prioritisation status for the inbox gate.
   */
  @Get("prioritisation-status")
  async getPrioritisationStatus(@Request() req) {
    return this.emailsService.getPrioritisationStatus(req.user.userId);
  }

  @Get("inbox-summary")
  async getInboxSummary(
    @Request() req,
    @Query()
    query: InboxSummaryQuery,
  ) {
    const {
      mode = "triage",
      categoryIds,
      minPriority,
      maxPriority,
      includeThreadIds,
      accounts,
    } = query;
    const categoryIdList = categoryIds
      ? categoryIds.split(",").filter(Boolean)
      : undefined;
    const minPriorityValue =
      minPriority !== undefined && minPriority !== ""
        ? parseFloat(minPriority)
        : undefined;
    const maxPriorityValue =
      maxPriority !== undefined && maxPriority !== ""
        ? parseFloat(maxPriority)
        : undefined;
    const accountIds = accounts
      ? accounts.split(",").filter(Boolean)
      : undefined;

    return this.emailsService.getInboxSummary(req.user.userId, mode, {
      categoryIds: categoryIdList,
      minPriority: minPriorityValue,
      maxPriority: maxPriorityValue,
      includeThreadIds: includeThreadIds === BOOLEAN_STRING_VALUES.TRUE,
      accountIds,
    });
  }

  @Get("batch-status")
  async getBatchStatus(@Request() req) {
    const perf = new BatchStatusPerformanceTracker();

    try {
      const schedule = await this.batchScheduleService.getSchedule(
        req.user.userId,
      );
      if (!schedule) {
        const defaults = this.batchScheduleService.getDefaultSchedule();
        const tempSchedule = {
          ...defaults,
          userId: req.user.userId,
          id: "temp",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BatchSchedule;
        const nextTime =
          this.batchScheduleService.getNextScheduledDeliveryTime(tempSchedule);
        perf.finish();
        return { nextDelivery: nextTime };
      }
      const nextTime =
        this.batchScheduleService.getNextScheduledDeliveryTime(schedule);
      perf.finish();
      return { nextDelivery: nextTime };
    } catch (error) {
      perf.finish();
      throw error;
    }
  }

  @Get("tab-counts")
  async getTabCounts(
    @Request() req,
    @Query("minPriority") minPriority?: string,
    @Query("maxPriority") maxPriority?: string,
    @Query("categories") categories?: string,
    @Query("accountIds") accountIds?: string,
  ) {
    const { userId } = req.user;
    const categoryIdList = categories?.split(",").filter(Boolean);
    const accountIdList = accountIds?.split(",").filter(Boolean);
    const hasFilters =
      minPriority !== undefined ||
      maxPriority !== undefined ||
      categoryIdList !== undefined ||
      accountIdList !== undefined;
    const filters = hasFilters
      ? {
          ...(minPriority !== undefined
            ? { minPriority: parseFloat(minPriority) }
            : {}),
          ...(maxPriority !== undefined
            ? { maxPriority: parseFloat(maxPriority) }
            : {}),
          ...(categoryIdList ? { categoryIds: categoryIdList } : {}),
          ...(accountIdList ? { accountIds: accountIdList } : {}),
        }
      : undefined;

    const [triageSummary, actionSummary, followUpSummary] = await Promise.all([
      this.emailsService.getInboxSummary(userId, "triage", filters),
      this.emailsService.getInboxSummary(userId, "action", filters),
      this.emailsService.getInboxSummary(userId, "follow-up", filters),
    ]);

    return {
      triage: triageSummary.total,
      action: actionSummary.total,
      followUp: followUpSummary.total,
    };
  }

  // ---------------------------------------------------------------------------
  // Search (instant path + legacy)
  // search/rank and search/expand live in EmailSearchOpsController
  // ---------------------------------------------------------------------------

  @Get("search")
  async searchEmails(
    @Request() req,
    @Query("q") query: string,
    @Query("maxResults") maxResults?: string,
    @Query("accountTypes") accountTypes?: string,
    @Query("skipLlm") skipLlm?: string,
  ) {
    if (!query) {
      return [];
    }
    const max = maxResults
      ? parseInt(maxResults, 10)
      : EMAIL_CONTROLLER_DEFAULTS.MAX_RESULTS;
    const selectedAccountTypes = accountTypes
      ? accountTypes.split(",")
      : undefined;
    const skipLlmRanking = skipLlm === BOOLEAN_STRING_VALUES.TRUE;

    // ---------------------------------------------------------------------------
    // Instant search path (INSTANT_SEARCH_ENABLED=true)
    // Phase 1: return metadata-only results immediately (< 500 ms)
    // Phase 2: background enrichment, polled via GET /emails/search/enrichment/:jobId
    //
    // NOTE: Instant search is Gmail-only. Office365 and Zoho do not expose a
    // metadata-only fetch equivalent, so they always return empty results on
    // this path. Users with Office365 or Zoho accounts should disable
    // INSTANT_SEARCH_ENABLED — they will be served by the legacy path below.
    // ---------------------------------------------------------------------------
    if (process.env.INSTANT_SEARCH_ENABLED === BOOLEAN_STRING_VALUES.TRUE) {
      try {
        const { userId } = req.user;

        const gmailResults = await this.gmailProvider.searchEmailsMetadataOnly(
          userId,
          query,
          max,
        );

        if (gmailResults.length === 0) {
          return {
            results: [],
            enrichmentJobId: null,
            query,
            queriesTried: [],
            totalGmailResults: 0,
          };
        }

        const enrichmentJobId =
          await this.searchEnrichmentService.startEnrichmentJob(
            userId,
            gmailResults,
          );

        return {
          results: gmailResults,
          enrichmentJobId,
          query,
          queriesTried: [],
          totalGmailResults: gmailResults.length,
        };
      } catch (error) {
        this.logger.error(`Error in instant searchEmails:`, error);
        return {
          results: [],
          enrichmentJobId: null,
          query,
          queriesTried: [],
          totalGmailResults: 0,
        };
      }
    }

    // ---------------------------------------------------------------------------
    // Legacy search path (INSTANT_SEARCH_ENABLED not set or false)
    // ---------------------------------------------------------------------------
    try {
      return await this.emailsService.searchEmails(req.user.userId, query, {
        maxResults: max,
        accountTypes: selectedAccountTypes,
        skipLlmRanking,
        skipLlmFallback: skipLlmRanking,
        skipSync: false,
        ...(skipLlmRanking ? { maxSyncThreads: 5 } : {}),
      });
    } catch (error) {
      this.logger.error(`Error in searchEmails:`, error);
      return [
        {
          id: "no-results",
          subject: "",
          from: "",
          body: "",
          receivedAt: new Date().toISOString(),
          debugInfo: {
            originalQuery: query,
            queriesTried: [],
            message: `Error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
            error: true,
          },
        },
      ];
    }
  }

  /**
   * Poll the status of a background search enrichment job.
   * Returns the full set of enriched results on every poll (not incremental).
   *
   * GET /emails/search/enrichment/:jobId
   */
  @Get("search/enrichment/:jobId")
  async getSearchEnrichmentStatus(
    @Request() req,
    @Param("jobId") jobId: string,
  ) {
    const status = this.searchEnrichmentService.getStatus(
      jobId,
      req.user.userId,
    );
    if (!status) {
      throw new NotFoundException(`Enrichment job ${jobId} not found`);
    }
    return status;
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  @Get("stats")
  async getEmailStats(@Request() req, @Query("days") daysParam?: string) {
    const days = Math.min(
      daysParam ? parseInt(daysParam, 10) : EMAIL_CONTROLLER_DEFAULTS.DAYS,
      EMAIL_CONTROLLER_DEFAULTS.MAX_DAYS,
    );
    const { userId } = req.user;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await this.emailAdminService.getEmailStats(userId, since);

    return {
      days,
      ...stats,
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * Exports all emails for the authenticated user as a password-protected ZIP
   * file. Email content is decrypted server-side so the JSON inside the ZIP is
   * human-readable. The ZIP uses ZipCrypto (PKZIP 2.0) encryption, which is
   * natively supported by macOS Archive Utility and Windows Explorer without
   * any third-party software.
   */
  @Post("export")
  async exportEmails(
    @Request() req,
    @Body() body: ExportEmailBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const zipBuffer = await this.emailExportService.exportEmails(
      req.user.userId,
      body.password,
    );
    const filename = `bearlymail-emails-${new Date().toISOString().split("T")[0]}.zip`;
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": zipBuffer.length,
    });
    return new StreamableFile(zipBuffer);
  }

  // ---------------------------------------------------------------------------
  // Core email CRUD
  // ---------------------------------------------------------------------------

  @Get(":id/priority-explanation")
  async getPriorityExplanation(@Request() req, @Param("id") id: string) {
    return this.emailsService.getPriorityExplanation(req.user.userId, id);
  }

  private async getEmailOrThrow(userId: string, id: string): Promise<Email> {
    // Fix #1296: reject non-UUID ids immediately to prevent PostgreSQL cast errors.
    if (!isUuid(id))
      throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    const email = await this.emailsService.getEmailById(userId, id);
    if (!email) throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    return email;
  }

  @Get(":id/thread")
  async getThread(@Request() req, @Param("id") id: string) {
    const email = await this.getEmailOrThrow(req.user.userId, id);
    const threadEmails = await this.emailsService.getThreadEmails(
      req.user.userId,
      email.threadId,
      { order: "DESC" },
    );
    // Defence-in-depth: normalise attachments to null if not an array (see #1589)
    return threadEmails.map((threadEmail) => {
      if (
        threadEmail.attachments !== null &&
        threadEmail.attachments !== undefined &&
        !Array.isArray(threadEmail.attachments)
      ) {
        console.warn(
          `[getThread] email ${threadEmail.id} has non-array attachments (type=${typeof threadEmail.attachments}). Normalising to null.`,
        );
        return { ...threadEmail, attachments: null };
      }
      return threadEmail;
    });
  }

  @Get(":id")
  async getEmail(@Request() req, @Param("id") id: string) {
    const email = await this.getEmailOrThrow(req.user.userId, id);
    decryptEmailEntityForApi(email);

    // Defence-in-depth: ensure attachments is always null or an Array.
    // encryptedJsonTransformer returns `unknown` at runtime; if bad data is stored
    // (e.g. a plain object instead of an array), normalise to null here so clients
    // never receive a non-array value that would cause `?.some is not a function`.
    if (
      email.attachments !== null &&
      email.attachments !== undefined &&
      !Array.isArray(email.attachments)
    ) {
      console.warn(
        `[getEmail] email ${id} has non-array attachments (type=${typeof email.attachments}). Normalising to null.`,
      );
      (email as unknown as Record<string, unknown>).attachments = null;
    }

    if (email.emailThreadId) {
      const thread = await this.emailAdminService.getEmailThreadById(
        req.user.userId,
        email.emailThreadId,
      );
      if (thread && thread.githubMetadata && thread.githubMetadata.links) {
        const seenUrls = new Set<string>();
        const uniqueLinks = thread.githubMetadata.links.filter((link) => {
          const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
          if (seenUrls.has(key)) {
            return false;
          }
          seenUrls.add(key);
          return true;
        });
        return {
          ...email,
          githubMetadata: { links: uniqueLinks },
        };
      }
    }

    return email;
  }

  @Get(":id/gmail-star-status")
  @UseGuards(JwtAuthGuard)
  async getGmailStarStatus(@Request() req, @Param("id") id: string) {
    return this.emailsService.getGmailStarStatus(req.user.userId, id);
  }

  @Get(":id/gmail-labels")
  @UseGuards(JwtAuthGuard)
  async getGmailLabels(@Request() req, @Param("id") id: string) {
    return this.emailsService.getGmailLabels(req.user.userId, id);
  }

  @Get(":id/attachments/:attachmentId")
  @UseGuards(JwtAuthGuard)
  async getAttachment(
    @Request() req,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    const attachment = await this.emailsService.getAttachment(
      req.user.userId,
      id,
      attachmentId,
    );

    return {
      base64Content: attachment.attachmentBuffer.toString("base64"),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };
  }

  @Post()
  async createEmail(@Request() req, @Body() emailData: Partial<Email>) {
    return this.emailsService.createEmail(req.user.userId, emailData);
  }

  @Put(":id/read")
  async markAsRead(@Request() req, @Param("id") id: string) {
    return this.emailsService.markAsRead(req.user.userId, id);
  }

  @Put(":id/unread")
  async markAsUnread(@Request() req, @Param("id") id: string) {
    return this.emailsService.markAsUnread(req.user.userId, id);
  }

  @Post("bulk/read")
  async bulkMarkAsRead(@Request() req, @Body() body: { emailIds: string[] }) {
    await this.emailsService.bulkMarkAsRead(req.user.userId, body.emailIds);
    return { message: "Emails marked as read" };
  }

  @Post("bulk/unread")
  async bulkMarkAsUnread(@Request() req, @Body() body: { emailIds: string[] }) {
    await this.emailsService.bulkMarkAsUnread(req.user.userId, body.emailIds);
    return { message: "Emails marked as unread" };
  }

  @Post("bulk/archive")
  async bulkArchive(@Request() req, @Body() body: { emailIds: string[] }) {
    this.logger.log(
      `[Archive] Bulk archive request received for ${body.emailIds.length} emails, userId: ${req.user.userId}`,
    );
    try {
      await this.emailsService.bulkArchiveEmails(
        req.user.userId,
        body.emailIds,
      );
      this.logger.log(
        `[Archive] Bulk archive completed: ${body.emailIds.length} emails, userId: ${req.user.userId}`,
      );
      return { message: "Emails archived" };
    } catch (error) {
      this.logger.error(
        `[Archive] Failed to bulk archive emails: userId: ${req.user.userId}`,
        error,
      );
      throw error;
    }
  }

  @Put(":id/archive")
  async archiveEmail(@Request() req, @Param("id") id: string) {
    this.logger.log(
      `[Archive] Archive request received for emailId: ${id}, userId: ${req.user.userId}`,
    );
    try {
      await this.emailsService.archiveEmail(req.user.userId, id);
      this.logger.log(
        `[Archive] Archive completed: emailId: ${id}, userId: ${req.user.userId}`,
      );
      return { message: "Email archived" };
    } catch (error) {
      this.logger.error(
        `[Archive] Failed to archive email: emailId: ${id}, userId: ${req.user.userId}`,
        error,
      );
      throw error;
    }
  }

  @Delete(":id")
  async deleteEmail(@Request() req, @Param("id") id: string) {
    await this.emailsService.deleteEmail(req.user.userId, id);
    return { message: "Email deleted" };
  }

  @Put(":id/star")
  async toggleStar(@Request() req, @Param("id") id: string) {
    return this.emailsService.toggleStar(req.user.userId, id);
  }

  @Put(":id/star-count")
  async setStarCount(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { starCount: number },
  ) {
    return this.emailsService.setStarCount(req.user.userId, id, body.starCount);
  }

  @Post(":id/block-sender")
  async blockSender(
    @Request() req,
    @Param("id") id: string,
    @Body() body?: { reason?: string; blockDomain?: boolean },
  ) {
    const email = await this.getEmailOrThrow(req.user.userId, id);
    decryptEmailEntityForApi(email);

    await this.emailAdminService.blockEmailSender(
      req.user.userId,
      email.from,
      email.fromName,
      body?.reason,
      body?.blockDomain,
    );

    await this.emailsService.archiveEmail(req.user.userId, id);

    return {
      success: true,
      message: `Blocked sender ${email.from}`,
      blockedEmail: email.from,
    };
  }

  @Post(":id/category-override")
  async overrideCategory(
    @Request() req,
    @Param("id") id: string,
    @Body() body: CategoryOverrideBody,
  ) {
    if (body.categoryId !== undefined && !isUuid(body.categoryId))
      throw new BadRequestException("categoryId must be a valid UUID");
    return this.emailsService.overrideCategory(
      req.user.userId,
      id,
      body.categoryName ?? body.category ?? "",
      body.reason,
      body.categoryId,
    );
  }

  @Post("force-check")
  async forceCheck(@Request() req) {
    await this.boss.send(
      JOB_NAMES.FETCH_USER_EMAILS,
      { userId: req.user.userId },
      {
        priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, true),
        singletonKey: `fetch-user-emails-${req.user.userId}`,
        singletonMinutes: 5,
      },
    );
    return this.emailsService.forceCheckNewEmails(req.user.userId);
  }

  @Post("check-urgent")
  async checkUrgent(@Request() req) {
    return this.emailsService.checkForUrgentEmails(req.user.userId);
  }
}
