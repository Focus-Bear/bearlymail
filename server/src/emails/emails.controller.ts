import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  Inject,
  Logger,
  UseInterceptors,
  UploadedFiles,
  forwardRef,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsService } from "./emails.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { ContactsService } from "../contacts/contacts.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { UsersService } from "../users/users.service";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import PgBoss from "pg-boss";
import { Email } from "../database/entities/email.entity";

/**
 * Extended pg-boss interface to access internal methods not exposed in types.
 * These are used for advanced job queue operations (resetting stuck jobs, etc.).
 * pg-boss's TypeScript types don't expose these internal APIs.
 */
interface PgBossWithInternals extends PgBoss {
  getQueueSize(name: string): Promise<number>;
  db: {
    executeSql(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowCount?: number; rows?: unknown[] }>;
  };
}
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GmailRequiredGuard } from "../auth/gmail-required.guard";
import { AdminGuard } from "../auth/admin.guard";
import { EmailRecipient } from "./interfaces/email-provider.interface";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import * as fs from "fs";
import * as path from "path";
import { getJobPriority } from "../queue/job-priorities";
import { QUERY_LIMITS } from "../constants/query-limits";

// Performance budgets for batch-status
// 500ms
const BATCH_STATUS_BUDGET = 500;

class BatchStatusPerformanceTracker {
  private startTime: number;
  private logger = new Logger("BatchStatusPerformanceTracker");
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(
    BatchStatusPerformanceTracker.logsDir,
    "performance.log",
  );

  constructor() {
    this.startTime = Date.now();
    if (!fs.existsSync(BatchStatusPerformanceTracker.logsDir)) {
      fs.mkdirSync(BatchStatusPerformanceTracker.logsDir, { recursive: true });
    }
  }

  finish(): void {
    const duration = Date.now() - this.startTime;
    if (duration > BATCH_STATUS_BUDGET) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: "batch-status",
        duration,
        budget: BATCH_STATUS_BUDGET,
        exceeded: true,
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;
      this.logger.warn(
        `⚠️ PERF ISSUE: batch-status took ${duration}ms (budget: ${BATCH_STATUS_BUDGET}ms)`,
      );

      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
      }
    }
  }
}

@Controller("emails")
@UseGuards(JwtAuthGuard, GmailRequiredGuard)
export class EmailsController {
  private readonly logger = new Logger(EmailsController.name);

  // eslint-disable-next-line max-params
  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly contactsService: ContactsService,
    private readonly blockedSendersService: BlockedSendersService,
    private readonly batchScheduleService: BatchScheduleService,
    private readonly usersService: UsersService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => ScheduledEmailsService))
    private readonly scheduledEmailsService: ScheduledEmailsService,
  ) {}

  @Get("inbox")
  async getInbox(
    @Request() req,
    @Query("includeBatched") includeBatched?: string,
    @Query("mode") mode: "triage" | "action" | "follow-up" = "triage",
    @Query("accounts") accounts?: string,
    @Query("categories") categories?: string,
    @Query("minPriority") minPriority?: string,
    @Query("page") pageParam?: string,
    @Query("limit") limitParam?: string,
    @Query("offset") offsetParam?: string,
  ) {
    // Parse filter parameters
    const accountIds = accounts
      ? accounts.split(",").filter(Boolean)
      : undefined;
    const categoryList = categories
      ? categories.split(",").filter(Boolean)
      : undefined;
    const minPriorityValue = minPriority ? parseFloat(minPriority) : undefined;

    // Parse pagination parameters
    const pageSize = limitParam
      ? Math.max(1, parseInt(limitParam, 10))
      : QUERY_LIMITS.INBOX_PAGE_SIZE;
    const pageNum = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    // Support explicit offset override (useful when in-memory filtering means page boundaries don't align)
    const offset =
      offsetParam !== undefined
        ? Math.max(0, parseInt(offsetParam, 10))
        : (pageNum - 1) * pageSize;

    const result = await this.emailsService.getInbox(
      req.user.userId,
      includeBatched === "true",
      mode,
      {
        accountIds,
        categories: categoryList,
        minPriority: minPriorityValue,
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
    // Return list of user's connected email accounts for filtering
    return this.emailsService.getConnectedAccounts(req.user.userId);
  }

  @Get("categories")
  async getCategories(@Request() req) {
    // Return list of unique categories for filtering
    return this.emailsService.getCategories(req.user.userId);
  }

  @Get("batch-status")
  async getBatchStatus(@Request() req) {
    const perf = new BatchStatusPerformanceTracker();

    try {
      // Get next delivery time from the batch schedule, not from batched emails
      // Use getNextScheduledDeliveryTime to always show the next scheduled time
      // regardless of whether batching is enabled (for display purposes)
      const schedule = await this.batchScheduleService.getSchedule(
        req.user.userId,
      );
      if (!schedule) {
        // Use default schedule for new users
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
  async getTabCounts(@Request() req) {
    const { userId } = req.user;

    // Query counts for each tab mode in parallel
    // Use getInbox() for all modes to ensure counts match what's actually displayed
    // This accounts for filtering like batched emails, blocked senders, etc.
    const [triageEmails, actionEmails, followUpEmails] = await Promise.all([
      // Triage count: use the same logic as the inbox view
      // This accounts for batched emails, blocked senders, and other filters
      this.emailsService.getInbox(userId, false, "triage"),

      // Action count: use the same logic as the inbox view
      // This accounts for batched emails, blocked senders, snoozed emails, and other filters
      this.emailsService.getInbox(userId, false, "action"),

      // Follow-up count: use the same logic as the inbox view
      // This checks for threads where user sent last and no reply received
      this.emailsService.getInbox(userId, false, "follow-up"),
    ]);

    return {
      triage: triageEmails.total,
      action: actionEmails.total,
      followUp: followUpEmails.total,
    };
  }

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
    const DEFAULT_MAX_RESULTS = 50;
    const max = maxResults ? parseInt(maxResults, 10) : DEFAULT_MAX_RESULTS;
    const selectedAccountTypes = accountTypes
      ? accountTypes.split(",")
      : undefined;
    const skipLlmRanking = skipLlm === "true";
    try {
      return await this.emailsService.searchEmails(
        req.user.userId,
        query,
        max,
        undefined,
        selectedAccountTypes,
        skipLlmRanking,
      );
    } catch (error) {
      this.logger.error(`Error in searchEmails:`, error);
      // Return no-results marker with error info so UI can show what happened
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

  @Post("search/rank")
  async rankSearchResults(
    @Request() req,
    @Body() body: { emailIds: string[]; query: string; maxResults?: number },
  ) {
    const { emailIds, query, maxResults } = body;
    if (!query || !emailIds || emailIds.length === 0) {
      return [];
    }
    const DEFAULT_MAX_RESULTS = 50;
    try {
      return await this.emailsService.rankSearchResults(
        req.user.userId,
        query,
        emailIds,
        maxResults ?? DEFAULT_MAX_RESULTS,
      );
    } catch (error) {
      this.logger.error(`Error in rankSearchResults:`, error);
      return [];
    }
  }

  @Post("search/expand")
  async expandSearchResults(
    @Request() req,
    @Body() body: { query: string; existingEmailIds: string[] },
  ) {
    const { query, existingEmailIds } = body;
    if (!query) {
      return [];
    }
    try {
      return await this.emailsService.expandSearchResults(
        req.user.userId,
        query,
        existingEmailIds ?? [],
      );
    } catch (error) {
      this.logger.error(`Error in expandSearchResults:`, error);
      return [];
    }
  }

  @Get("stats")
  async getEmailStats(@Request() req, @Query("days") daysParam?: string) {
    const DEFAULT_DAYS = 30;
    const MAX_DAYS = 90;
    const days = Math.min(
      daysParam ? parseInt(daysParam, 10) : DEFAULT_DAYS,
      MAX_DAYS,
    );
    const { userId } = req.user;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const emailsPerDay = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("DATE(email.receivedAt)", "date")
      .addSelect("COUNT(DISTINCT email.id)", "count")
      .addSelect("thread.category", "category")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("DATE(email.receivedAt)")
      .addGroupBy("thread.category")
      .orderBy("DATE(email.receivedAt)", "ASC")
      .getRawMany();

    const replyTimesByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("thread.category", "category")
      .addSelect("AVG(email.timeToReply)", "avgReplyTimeMinutes")
      .addSelect("MIN(email.timeToReply)", "minReplyTimeMinutes")
      .addSelect("MAX(email.timeToReply)", "maxReplyTimeMinutes")
      .addSelect("COUNT(email.id)", "repliedCount")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.timeToReply IS NOT NULL")
      .andWhere("email.timeToReply > 0")
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("thread.category")
      .getRawMany();

    const totalByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("thread.category", "category")
      .addSelect("COUNT(DISTINCT email.id)", "total")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("thread.category")
      .getRawMany();

    return {
      days,
      emailsPerDay,
      replyTimesByCategory,
      totalByCategory,
    };
  }

  @Get(":id/priority-explanation")
  async getPriorityExplanation(@Request() req, @Param("id") id: string) {
    return this.emailsService.getPriorityExplanation(req.user.userId, id);
  }

  @Get(":id/thread")
  async getThread(@Request() req, @Param("id") id: string) {
    // Get the email to find its threadId
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) {
      throw new Error("Email not found");
    }
    // Return all emails in the thread, sorted by most recent first
    return this.emailsService.getThreadEmails(req.user.userId, email.threadId, {
      order: "DESC",
    });
  }

  @Get(":id")
  async getEmail(@Request() req, @Param("id") id: string) {
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) {
      throw new Error("Email not found");
    }

    // Include thread's githubMetadata if available
    if (email.emailThreadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId: req.user.userId },
      });
      if (thread && thread.githubMetadata && thread.githubMetadata.links) {
        // Deduplicate links by URL to prevent duplicate cards in UI
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

    // Set appropriate headers for file download
    return {
      data: attachment.data.toString("base64"),
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
      // Archive email - DB update happens first for immediate UI effect,
      // then Gmail sync happens (but doesn't block the response)
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
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) {
      throw new Error("Email not found");
    }

    // Block the sender
    await this.blockedSendersService.blockSender(
      req.user.userId,
      email.from,
      email.fromName,
      body?.reason,
      body?.blockDomain,
    );

    // Archive the thread
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
    @Body() body: { category: string; reason?: string },
  ) {
    return this.emailsService.overrideCategory(
      req.user.userId,
      id,
      body.category,
      body.reason,
    );
  }

  @Post("force-check")
  async forceCheck(@Request() req) {
    // Add sync job to queue with singletonKey to prevent duplicates
    // Only one sync job per user can be queued at a time
    await this.boss.send(
      "fetch-user-emails",
      { userId: req.user.userId },
      {
        priority: getJobPriority("fetch-user-emails", true),
        // User-triggered = high priority
        singletonKey: `fetch-user-emails-${req.user.userId}`,
        // Don't allow another fetch for same user within 5 minutes
        singletonMinutes: 5,
      },
    );
    // Immediately unbatch everything and return
    return this.emailsService.forceCheckNewEmails(req.user.userId);
  }

  @Post("check-urgent")
  async checkUrgent(@Request() req) {
    // DON'T queue a sync job here - this is called on every page load!
    // Just check for urgent emails in the existing data
    // Syncing is handled by the cron job and force-check button
    return this.emailsService.checkForUrgentEmails(req.user.userId);
  }

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resetStuckJobs(@Request() _req) {
    // Reset jobs that are stuck in retry state with future startafter times
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const now = new Date();

    // Get all jobs that are scheduled for the future (stuck in backoff)
    // Cast to extended interface to access internal pg-boss methods
    const bossInternal = this.boss as unknown as PgBossWithInternals;
    const stuckJobs = await bossInternal.getQueueSize("refine-priority");
    const stuckSummary = await bossInternal.getQueueSize("generate-summary");
    const stuckSync = await bossInternal.getQueueSize("sync-emails");

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
        "refine-priority": stuckJobs,
        "generate-summary": stuckSummary,
        "sync-emails": stuckSync,
      },
      resetCount: result?.rowCount || 0,
    };
  }

  @Post("debug/fix-stuck-calculating")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async fixStuckCalculating(@Request() req) {
    return this.emailsService.fixStuckCalculatingThreads(req.user.userId);
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

  @Post("send")
  @UseInterceptors(FilesInterceptor("files", 10))
  async sendEmail(
    @Request() req,
    @Body()
    body: {
      to: EmailRecipient[];
      subject: string;
      body: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      scheduledSendAt?: string;
      userTimezone?: string;
    },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const { userId } = req.user;

    const attachments =
      files?.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      })) || undefined;

    // If scheduled send time is provided, create scheduled email instead of sending immediately
    if (body.scheduledSendAt) {
      const scheduledSendAt = new Date(body.scheduledSendAt);

      // Convert attachments to base64 for storage
      const scheduledAttachments = attachments?.map((att) => ({
        filename: att.filename,
        mimeType: att.mimeType,
        content: att.content.toString("base64"),
      }));

      const scheduledEmail = await this.scheduledEmailsService.scheduleEmail(
        userId,
        {
          emailType: "new",
          to: body.to,
          cc: body.cc,
          bcc: body.bcc,
          subject: body.subject,
          body: body.body,
          attachments: scheduledAttachments,
          scheduledSendAt,
          userTimezone: body.userTimezone,
        },
      );

      return {
        success: true,
        scheduledEmailId: scheduledEmail.id,
        scheduledSendAt: scheduledEmail.scheduledSendAt,
        message: "Email scheduled successfully",
      };
    }

    // Otherwise send immediately (existing behavior)
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);

    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    // Get user to append signature
    const user = await this.usersService.findOne(userId);
    const signature =
      user?.emailSignature ||
      "Sent from BearlyMail (anti inbox overwhelm system)";
    const bodyWithSignature = `${body.body}\n\n${signature}`;

    // Send the email
    const result = await provider.sendEmail(
      userId,
      body.to,
      body.subject,
      bodyWithSignature,
      body.cc,
      body.bcc,
      attachments,
    );

    // Track contact frequency for each recipient
    const allRecipients = [...body.to, ...(body.cc || []), ...(body.bcc || [])];
    for (const recipient of allRecipients) {
      await this.contactsService.incrementContactFrequency(
        userId,
        recipient.email,
      );
    }

    return {
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    };
  }

  @Post(":id/accelerate")
  async accelerateEmail(@Request() req, @Param("id") id: string) {
    // Accelerate processing for a specific email (user is viewing it)
    // Cancel existing jobs and requeue with highest priority
    const { userId } = req.user;

    const email = await this.emailsService.getEmailById(userId, id);
    if (!email) {
      return { message: "Email not found" };
    }

    const queued: string[] = [];
    const cancelled: string[] = [];

    // Cancel existing jobs for this email before requeuing
    // Use raw SQL to find and cancel jobs matching the emailId
    // Cast to extended interface to access internal pg-boss db methods
    const { db } = this.boss as unknown as PgBossWithInternals;

    // Cancel existing refine-priority jobs for this email
    const priorityCancelResult = await db.executeSql(
      `UPDATE pgboss.job 
       SET state = 'cancelled' 
       WHERE name = 'refine-priority' 
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [id, userId],
    );
    if (priorityCancelResult?.rowCount > 0) {
      cancelled.push(`refine-priority (${priorityCancelResult.rowCount})`);
    }

    // Cancel existing generate-summary jobs for this email
    const summaryCancelResult = await db.executeSql(
      `UPDATE pgboss.job 
       SET state = 'cancelled' 
       WHERE name = 'generate-summary' 
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [id, userId],
    );
    if (summaryCancelResult?.rowCount > 0) {
      cancelled.push(`generate-summary (${summaryCancelResult.rowCount})`);
    }

    // If summary is processing or missing, queue with highest priority
    if (email.isProcessingSummary || !email.summary) {
      await this.boss.send(
        "generate-summary",
        { userId, emailId: id },
        {
          priority: getJobPriority("generate-summary", true),
          // User-triggered = high priority
          singletonKey: `summary-${id}`,
        },
      );
      queued.push("generate-summary");
    }

    // If priority is default, queue refinement with highest priority
    const priorityScore = email.getPriorityScore();
    const DEFAULT_PRIORITY_SCORE = 50;

    // Get thread to check isProcessingPriority (priority is thread-level)
    let thread = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }

    if (
      priorityScore === DEFAULT_PRIORITY_SCORE ||
      thread?.isProcessingPriority
    ) {
      await this.boss.send(
        "refine-priority",
        { userId, emailId: id },
        {
          priority: getJobPriority("refine-priority", true),
          // User-triggered = high priority
          singletonKey: `priority-${id}`,
        },
      );
      queued.push("refine-priority");
    }

    return {
      message: "Accelerated processing",
      queued,
      cancelled: cancelled.length > 0 ? cancelled : undefined,
    };
  }

  @Post("recategorize-triage")
  async recategorizeTriageEmails(
    @Request() req,
    @Query("modes") modesParam?: string,
  ) {
    const { userId } = req.user;

    const validModes = ["triage", "action"] as const;
    type ValidMode = (typeof validModes)[number];

    let modes: ValidMode[] = ["triage", "action"];
    if (modesParam) {
      const requestedModes = modesParam.split(",").map((mode) => mode.trim());
      modes = requestedModes.filter((mode): mode is ValidMode =>
        validModes.includes(mode as ValidMode),
      );
    }

    this.logger.log(
      `[Recategorize] Recategorize emails request for userId: ${userId}, modes: ${modes.join(", ")}`,
    );

    const allEmails: Email[] = [];
    const seenIds = new Set<string>();

    for (const mode of modes) {
      const result = await this.emailsService.getInbox(userId, false, mode);
      for (const email of result.emails) {
        if (!seenIds.has(email.id)) {
          seenIds.add(email.id);
          allEmails.push(email);
        }
      }
    }

    if (allEmails.length === 0) {
      return {
        message: `No emails to recategorize in ${modes.join(" or ")}`,
        queued: 0,
      };
    }

    let queued = 0;
    for (const email of allEmails) {
      await this.boss.send(
        "refine-priority",
        { userId, emailId: email.id, forceRecalculate: true },
        {
          priority: getJobPriority("refine-priority", true),
          singletonKey: `recategorize-${email.id}`,
          singletonMinutes: 1,
        },
      );
      queued++;
    }

    this.logger.log(
      `[Recategorize] Queued ${queued} recategorization jobs for userId: ${userId}`,
    );

    return {
      message: `Queued ${queued} emails for recategorization`,
      queued,
    };
  }

  @Get("admin/job-stats")
  @UseGuards(JwtAuthGuard, AdminGuard)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getJobStats(
    @Request() req,
    @Query("range") range: "24h" | "7d" | "30d" | "all" = "all",
  ) {
    // Get job queue statistics for admin dashboard
    // Dynamically fetch all job types from the database instead of hardcoding
    // Cast to extended interface to access internal pg-boss db methods
    const { db } = this.boss as unknown as PgBossWithInternals;

    // Calculate date filter based on range
    let dateFilter = "";
    if (range !== "all") {
      const hoursMap: Record<string, number> = {
        "24h": 24,
        "7d": 168,
        "30d": 720,
      };
      const hours = hoursMap[range] || 24;
      dateFilter = `AND createdon >= NOW() - INTERVAL '${hours} hours'`;
    }

    // Get current queue stats by job type and state (dynamically discovers all job types)
    const queueStats = await db.executeSql(`
      SELECT 
        name as "jobType",
        state,
        COUNT(*) as count
      FROM pgboss.job
      WHERE state IN ('created', 'retry', 'active', 'failed', 'completed')
        ${dateFilter}
      GROUP BY name, state
      ORDER BY name, state
    `);

    // Get completed counts and average completion times from archive
    const archiveStats = await db.executeSql(`
      SELECT 
        name as "jobType",
        COUNT(*) as "completedCount",
        AVG(EXTRACT(EPOCH FROM (completedon - createdon))) * 1000 as "avgCompletionTimeMs"
      FROM pgboss.archive
      WHERE completedon IS NOT NULL
        AND createdon IS NOT NULL
        AND completedon > createdon
        ${dateFilter}
      GROUP BY name
      ORDER BY name
    `);

    // Transform queue stats into a more usable format
    const statsByJobType: Record<
      string,
      {
        queued: number;
        active: number;
        retry: number;
        failed: number;
        completed: number;
        avgCompletionTimeMs: number | null;
      }
    > = {};

    // Populate queue stats (this dynamically discovers all job types)
    if (queueStats?.rows) {
      queueStats.rows.forEach(
        (row: { jobType: string; state: string; count: string }) => {
          const { jobType } = row;
          const { state } = row;
          const count = parseInt(row.count, 10);

          if (!statsByJobType[jobType]) {
            statsByJobType[jobType] = {
              queued: 0,
              active: 0,
              retry: 0,
              failed: 0,
              completed: 0,
              avgCompletionTimeMs: null,
            };
          }

          if (state === "created") {
            statsByJobType[jobType].queued = count;
          } else if (state === "active") {
            statsByJobType[jobType].active = count;
          } else if (state === "retry") {
            statsByJobType[jobType].retry = count;
          } else if (state === "failed") {
            statsByJobType[jobType].failed = count;
          } else if (state === "completed") {
            statsByJobType[jobType].completed = count;
          }
        },
      );
    }

    // Populate completed counts and average completion times from archive
    if (archiveStats?.rows) {
      archiveStats.rows.forEach(
        (row: {
          jobType: string;
          completedCount: string;
          avgCompletionTimeMs: string | null;
        }) => {
          const { jobType } = row;
          if (!statsByJobType[jobType]) {
            statsByJobType[jobType] = {
              queued: 0,
              active: 0,
              retry: 0,
              failed: 0,
              completed: 0,
              avgCompletionTimeMs: null,
            };
          }
          // Add archived completed count to any completed jobs still in main table
          statsByJobType[jobType].completed += parseInt(row.completedCount, 10);
          statsByJobType[jobType].avgCompletionTimeMs = row.avgCompletionTimeMs
            ? Math.round(parseFloat(row.avgCompletionTimeMs))
            : null;
        },
      );
    }

    // Convert to array format for easier frontend consumption
    // Sort by job type name for consistent ordering
    const statsArray = Object.entries(statsByJobType)
      .map(([jobType, stats]) => ({
        jobType,
        ...stats,
      }))
      .sort((a, b) => a.jobType.localeCompare(b.jobType));

    return {
      stats: statsArray,
      timestamp: new Date().toISOString(),
    };
  }
}
