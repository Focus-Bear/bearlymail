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
import PgBoss = require("pg-boss");
import { Email } from "../database/entities/email.entity";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GmailRequiredGuard } from "../auth/gmail-required.guard";
import { AdminGuard } from "../auth/admin.guard";
import { EmailRecipient } from "./interfaces/email-provider.interface";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import * as fs from "fs";
import * as path from "path";
import { getJobPriority } from "../queue/job-priorities";

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
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  @Get("inbox")
  async getInbox(
    @Request() req,
    @Query("includeBatched") includeBatched?: string,
    @Query("mode") mode: "triage" | "action" | "follow-up" = "triage",
  ) {
    return this.emailsService.getInbox(
      req.user.userId,
      includeBatched === "true",
      mode,
    );
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
        const nextTime = this.batchScheduleService.getNextScheduledDeliveryTime(
          tempSchedule,
        );
        perf.finish();
        return { nextDelivery: nextTime };
      }
      const nextTime = this.batchScheduleService.getNextScheduledDeliveryTime(
        schedule,
      );
      perf.finish();
      return { nextDelivery: nextTime };
    } catch (error) {
      perf.finish();
      throw error;
    }
  }

  @Get("tab-counts")
  async getTabCounts(@Request() req) {
    const userId = req.user.userId;

    // Query counts for each tab mode in parallel
    // Use getInbox() for all modes to ensure counts match what's actually displayed
    // This accounts for filtering like batched emails, blocked senders, etc.
    const [triageEmails, actionCount, followUpEmails] = await Promise.all([
      // Triage count: use the same logic as the inbox view
      // This accounts for batched emails, blocked senders, and other filters
      this.emailsService.getInbox(userId, false, "triage"),

      // Action count: unarchived, starred
      // Note: Action mode may also have additional filters, but for now we keep the simple count
      // to avoid performance impact. If action count becomes inaccurate, update this similarly.
      this.emailThreadRepository
        .createQueryBuilder("thread")
        .where("thread.userId = :userId", { userId })
        .andWhere("thread.isArchived = false")
        .andWhere("thread.starCount > 0")
        .getCount(),

      // Follow-up count: use the same logic as the inbox view
      // This checks for threads where user sent last and no reply received
      this.emailsService.getInbox(userId, false, "follow-up"),
    ]);

    return {
      triage: triageEmails.length,
      action: actionCount,
      followUp: followUpEmails.length,
    };
  }

  @Get("search")
  async searchEmails(
    @Request() req,
    @Query("q") query: string,
    @Query("maxResults") maxResults?: string,
  ) {
    if (!query) {
      return [];
    }
    const DEFAULT_MAX_RESULTS = 50;
    const max = maxResults ? parseInt(maxResults, 10) : DEFAULT_MAX_RESULTS;
    try {
      return await this.emailsService.searchEmails(req.user.userId, query, max);
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
    // Return all emails in the thread
    return this.emailsService.getThreadEmails(req.user.userId, email.threadId);
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

  @Put(":id/archive")
  async archiveEmail(@Request() req, @Param("id") id: string) {
    this.logger.log(`[Archive] Archive request received for emailId: ${id}, userId: ${req.user.userId}`);
    try {
      // Queue archive operation as background job instead of executing synchronously
      await this.boss.send(
        "archive-email",
        { userId: req.user.userId, emailId: id },
        {
          priority: getJobPriority("archive-email", true), // User-triggered = high priority
          singletonKey: `archive-email-${req.user.userId}-${id}`, // Prevent duplicate jobs
        },
      );
      this.logger.log(`[Archive] Archive job queued: emailId: ${id}, userId: ${req.user.userId}`);
      return { message: "Email archive queued" };
    } catch (error) {
      this.logger.error(`[Archive] Failed to queue archive job: emailId: ${id}, userId: ${req.user.userId}`, error);
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
  async getSyncStatus(@Request() req) {
    return this.emailsService.getSyncStatus(req.user.userId);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resetStuckJobs(@Request() _req) {
    // Reset jobs that are stuck in retry state with future startafter times
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const now = new Date();

    // Get all jobs that are scheduled for the future (stuck in backoff)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stuckJobs = await (this.boss as any).getQueueSize("refine-priority");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stuckSummary = await (this.boss as any).getQueueSize(
      "generate-summary",
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stuckSync = await (this.boss as any).getQueueSize("sync-emails");

    // Use raw SQL to reset startafter for stuck jobs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.boss as any).db.executeSql(`
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
  async fixStuckCalculating(@Request() req) {
    return this.emailsService.fixStuckCalculatingThreads(req.user.userId);
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
    },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const { userId } = req.user;
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);

    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    const attachments =
      files?.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      })) || undefined;

    // Send the email
    const result = await provider.sendEmail(
      userId,
      body.to,
      body.subject,
      body.body,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.boss as any).db;

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

  @Get("admin/job-stats")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getJobStats(@Request() req) {
    // Get job queue statistics for admin dashboard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.boss as any).db;

    // Get current queue stats by job type and state
    const queueStats = await db.executeSql(`
      SELECT 
        name as "jobType",
        state,
        COUNT(*) as count
      FROM pgboss.job
      WHERE state IN ('created', 'retry', 'active', 'failed')
      GROUP BY name, state
      ORDER BY name, state
    `);

    // Get average completion times from archive
    const avgCompletionTimes = await db.executeSql(`
      SELECT 
        name as "jobType",
        AVG(EXTRACT(EPOCH FROM (completedon - createdon))) * 1000 as "avgCompletionTimeMs"
      FROM pgboss.archive
      WHERE completedon IS NOT NULL
        AND createdon IS NOT NULL
        AND completedon > createdon
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
        avgCompletionTimeMs: number | null;
      }
    > = {};

    // Initialize all job types
    const jobTypes = [
      "refine-priority",
      "generate-summary",
      "fetch-user-emails",
      "sync-emails", // Legacy
      "scan-history",
      "learn-from-star",
      "analyze-context",
      "schedule-email-fetch-jobs",
    ];

    jobTypes.forEach((jobType) => {
      statsByJobType[jobType] = {
        queued: 0,
        active: 0,
        retry: 0,
        failed: 0,
        avgCompletionTimeMs: null,
      };
    });

    // Populate queue stats
    if (queueStats?.rows) {
      queueStats.rows.forEach((row: { jobType: string; state: string; count: string }) => {
        const jobType = row.jobType;
        const state = row.state;
        const count = parseInt(row.count, 10);

        if (!statsByJobType[jobType]) {
          statsByJobType[jobType] = {
            queued: 0,
            active: 0,
            retry: 0,
            failed: 0,
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
        }
      });
    }

    // Populate average completion times
    if (avgCompletionTimes?.rows) {
      avgCompletionTimes.rows.forEach(
        (row: { jobType: string; avgCompletionTimeMs: string | null }) => {
          const jobType = row.jobType;
          if (statsByJobType[jobType]) {
            statsByJobType[jobType].avgCompletionTimeMs = row.avgCompletionTimeMs
              ? Math.round(parseFloat(row.avgCompletionTimeMs))
              : null;
          }
        },
      );
    }

    // Convert to array format for easier frontend consumption
    const statsArray = Object.entries(statsByJobType).map(([jobType, stats]) => ({
      jobType,
      ...stats,
    }));

    return {
      stats: statsArray,
      timestamp: new Date().toISOString(),
    };
  }
}
