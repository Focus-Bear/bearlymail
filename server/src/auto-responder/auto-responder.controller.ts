import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { AutoResponderService } from "./auto-responder.service";
import { AutoResponderArchiveAuditService } from "./auto-responder-archive-audit.service";
import { QueueStatsService } from "./queue-stats.service";
import { AutoResponderConfig } from "./types/auto-responder.types";

const DEFAULT_PAGE_LIMIT = 50;

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
  };
}

@Controller("auto-responder")
@UseGuards(JwtAuthGuard)
export class AutoResponderController {
  private readonly logger = new Logger(AutoResponderController.name);

  constructor(
    private autoResponderService: AutoResponderService,
    private queueStatsService: QueueStatsService,
    private archiveAuditService: AutoResponderArchiveAuditService,
  ) {}

  /**
   * Get user's auto-responder configuration
   */
  @Get("settings")
  async getSettings(@Request() req: AuthenticatedRequest) {
    const config = await this.autoResponderService.getConfig(req.user.userId);
    return { config };
  }

  /**
   * Update user's auto-responder configuration
   */
  @Put("settings")
  async updateSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: Partial<AutoResponderConfig>,
  ) {
    const config = await this.autoResponderService.updateConfig(
      req.user.userId,
      body,
    );
    return { config };
  }

  /**
   * Get current queue statistics for preview
   */
  @Get("stats")
  async getStats(@Request() req: AuthenticatedRequest) {
    const stats = await this.queueStatsService.getQueueStats(req.user.userId);
    return { stats };
  }

  /**
   * Get threads where an auto-response was sent (autoresponded inbox mode)
   */
  @Get("threads")
  async getAutoRespondedThreads(
    @Request() req: AuthenticatedRequest,
    @Query()
    query: {
      categories?: string;
      minPriority?: string;
      maxPriority?: string;
      accounts?: string;
      limit?: string;
      offset?: string;
    },
  ) {
    const categoryList = query.categories
      ? query.categories.split(",").filter(Boolean)
      : undefined;
    const parsedMinPriority =
      query.minPriority !== undefined
        ? parseFloat(query.minPriority)
        : undefined;
    const minPriority = Number.isFinite(parsedMinPriority)
      ? parsedMinPriority
      : undefined;
    const parsedMaxPriority =
      query.maxPriority !== undefined
        ? parseFloat(query.maxPriority)
        : undefined;
    const maxPriority = Number.isFinite(parsedMaxPriority)
      ? parsedMaxPriority
      : undefined;
    const accountIds = query.accounts
      ? query.accounts.split(",").filter(Boolean)
      : undefined;

    const parsedLimit = query.limit ? parseInt(query.limit, 10) : NaN;
    const parsedOffset = query.offset ? parseInt(query.offset, 10) : NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, parsedLimit)
      : DEFAULT_PAGE_LIMIT;
    const offset = Number.isFinite(parsedOffset)
      ? Math.max(0, parsedOffset)
      : 0;

    return this.autoResponderService.getAutoRespondedThreads(req.user.userId, {
      categories: categoryList,
      minPriority,
      maxPriority,
      accountIds,
      limit,
      offset,
    });
  }

  /**
   * Get auto-response analytics
   */
  @Get("analytics")
  async getAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate
        ? {
            start: new Date(startDate),
            end: new Date(endDate),
          }
        : undefined;

    const analytics = await this.autoResponderService.getAnalytics(
      req.user.userId,
      dateRange,
    );
    return { analytics };
  }

  /**
   * Preview auto-response template with sample data
   */
  @Post("preview")
  async previewTemplate(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      templateType: "standard" | "highPriority" | "lowPriority" | "zeroBacklog";
    },
  ) {
    const preview = await this.autoResponderService.previewAutoResponse(
      req.user.userId,
      body.templateType,
    );
    return { preview };
  }

  /**
   * Preview auto-response for a specific email (shows what would actually be sent)
   */
  @Post("preview-email")
  async previewForEmail(
    @Request() req: AuthenticatedRequest,
    @Body() body: { emailId: string },
  ) {
    const preview = await this.autoResponderService.previewAutoResponseForEmail(
      req.user.userId,
      body.emailId,
    );
    return { preview };
  }

  /**
   * Get recent emails for preview selection
   */
  @Get("recent-emails")
  async getRecentEmails(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
  ) {
    const emails = await this.autoResponderService.getRecentEmailsForPreview(
      req.user.userId,
      limit ? parseInt(limit, 10) : 10,
    );
    return { emails };
  }

  /**
   * Test auto-response by triggering it for a specific thread
   */
  @Post("test")
  async testAutoResponse(
    @Request() req: AuthenticatedRequest,
    @Body() body: { emailThreadId: string },
  ) {
    const result = await this.autoResponderService.processEmailForAutoResponse(
      req.user.userId,
      body.emailThreadId,
    );
    return { result };
  }

  /**
   * Add opt-out suppression for a sender
   */
  @Post("opt-out")
  async addOptOut(
    @Request() req: AuthenticatedRequest,
    @Body() body: { senderEmail: string; notes?: string },
  ) {
    await this.autoResponderService.addOptOutSuppression(
      req.user.userId,
      body.senderEmail,
      body.notes,
    );
    return { success: true };
  }

  /**
   * Remove opt-out suppression for a sender
   */
  @Post("remove-opt-out")
  async removeOptOut(
    @Request() req: AuthenticatedRequest,
    @Body() body: { senderEmail: string },
  ) {
    await this.autoResponderService.removeOptOutSuppression(
      req.user.userId,
      body.senderEmail,
    );
    return { success: true };
  }

  /**
   * Audit and recover email threads that were silently archived after an auto-response
   * was sent (Issue #857). Threads are re-surfaced to the inbox if:
   *   - They have an auto-response log entry
   *   - They are currently archived (isArchived = true)
   *   - The user did NOT explicitly archive them after the auto-response
   *
   * @param dryRun - If "true", only reports affected threads without modifying the DB
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/audit-archived-threads")
  async auditArchivedThreads(
    @Request() req: AuthenticatedRequest,
    @Query("dryRun") dryRun?: string,
  ) {
    const isDryRun = dryRun === BOOLEAN_STRING_VALUES.TRUE;
    this.logger.log(
      `Archive audit requested by user ${req.user.userId} (dryRun=${isDryRun})`,
    );
    const result =
      await this.archiveAuditService.auditArchivedAutoRespondedThreads(
        req.user.userId,
        isDryRun,
      );
    return result;
  }

  /**
   * Admin: one-time fix to un-archive threads incorrectly archived by the
   * autoresponder (#857 regression). Safe to run multiple times.
   * Only un-archives threads where the user never manually archived them
   * (userArchivedAt IS NULL) and the thread has an auto_response_logs entry.
   */
  @Post("debug/fix-archived-threads")
  @UseGuards(AdminGuard)
  async fixArchivedThreads(@Request() req: AuthenticatedRequest) {
    return this.autoResponderService.fixAutoresponderArchivedThreads(
      req.user.userId,
    );
  }
}
