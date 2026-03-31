import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as os from "os";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { JOB_NAMES } from "../constants/job-names";
import {
  BODY_PREVIEW_LENGTHS,
  QA_KEYWORD_REGEX,
  QA_KEYWORD_SCAN,
} from "../constants/llm-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { DebugService } from "../debug/debug.service";
import { DEBUG_FEATURES } from "../debug/debug-feature-names";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { PriorityService } from "../priority/priority.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { EmailsService } from "./emails.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

// Preview length constants for log messages
const ORCHESTRATOR_CONSTANTS = {
  SUBSTRING_PREVIEW_LENGTH: 8,
  SUBJECT_PREVIEW_LENGTH: 50,
  THREAD_EMAILS_LIMIT: 15,
} as const;

/**
 * Thin orchestrator for LLM email processing jobs (priority refinement + summarization).
 * Delegates domain logic to focused sub-services (Phase 7b, issue #939).
 *
 * Sub-services:
 * - LLMPriorityResultService: apply/compute priority results, category resolution
 * - LLMPriorityBatchService: batch email priority processing
 * - LLMSummaryProcessorService: summary job processing + incremental analysis
 */
@Injectable()
export class LLMProcessor implements OnModuleInit {
  private readonly logger = new Logger(LLMProcessor.name);
  private readonly priorityConcurrency: number;
  private readonly summaryConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private priorityCacheService: PriorityCacheService,
    private priorityAnalysisService: PriorityAnalysisService,
    private cloudWatchService: CloudWatchService,
    private protoCategoriesService: ProtoCategoriesService,
    private priorityResultService: LLMPriorityResultService,
    private priorityBatchService: LLMPriorityBatchService,
    private summaryProcessorService: LLMSummaryProcessorService,
    private debugService: DebugService,
  ) {
    const cpuCores = os.cpus().length;
    const defaultConcurrency = Math.max(4, cpuCores * 2);

    this.priorityConcurrency = parseInt(
      process.env.LLM_PRIORITY_CONCURRENCY || String(defaultConcurrency),
      10,
    );
    this.summaryConcurrency = parseInt(
      process.env.LLM_SUMMARY_CONCURRENCY || String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, LLM worker concurrency: priority=${this.priorityConcurrency}, summary=${this.summaryConcurrency}`,
    );
  }

  async onModuleInit() {
    this.logger.log(
      `Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`,
    );
    await this.boss.work(
      JOB_NAMES.REFINE_PRIORITY,
      { teamSize: this.priorityConcurrency },
      async (job) => this.handleRefinePriorityJob(job as PgBoss.Job),
    );

    const parallelCalls = parseInt(
      process.env.LLM_SUMMARY_PARALLEL_CALLS || "5",
      10,
    );
    this.logger.log(
      `Starting summary generation worker with ${parallelCalls} parallel LLM calls per batch`,
    );
    await this.boss.work(
      JOB_NAMES.GENERATE_SUMMARY,
      { batchSize: parallelCalls },
      async (jobs) => {
        const jobArray = Array.isArray(jobs) ? jobs : [jobs];
        const batchId = `batch-${Date.now()}`;
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.GENERATE_SUMMARY,
          batchId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ batchSize: jobArray.length });
        this.logger.log(
          `[Worker ${batchId}] Processing ${jobArray.length} threads with parallel LLM calls`,
        );
        await this.summaryProcessorService.processSummaryJobBatch(
          jobArray,
          batchId,
          tracker,
        );
      },
    );

    this.logger.log("Starting batch priority refinement worker");
    await this.boss.work(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      { teamSize: Math.max(2, Math.floor(this.priorityConcurrency / 2)) },
      async (job) => this.handleRefinePriorityBatchJob(job as PgBoss.Job),
    );
  }

  private async fetchEmailForPriority(
    userId: string,
    emailId: string,
    forceRecalculate: boolean | undefined,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<{ email: Email; thread: EmailThread | null } | null> {
    tracker.startPhase("dataFetch");
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(`Email ${emailId} not found`);
      return null;
    }
    let thread: EmailThread | null = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }
    const shouldSkip =
      await this.priorityBatchService.shouldSkipPriorityRecalculation(
        thread,
        forceRecalculate,
        email,
        workerId,
        emailId,
      );
    if (shouldSkip) return null;
    return { email, thread };
  }

  private async runFullPriorityRefinement(options: {
    userId: string;
    emailId: string;
    email: Email;
    thread: EmailThread | null;
    workerId: string;
    tracker: JobPerformanceTracker;
  }): Promise<void> {
    const { userId, emailId, email, thread, workerId, tracker } = options;
    if (email.emailThreadId && thread) {
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        { isProcessingPriority: true },
      );
    }

    const [contexts, avgTimeToReply, threadEmails, protoCategories] =
      await Promise.all([
        this.priorityCacheService.getUserContexts(userId),
        this.priorityCacheService.getAvgTimeToReply(userId),
        email.threadId
          ? this.emailsService.getThreadEmails(userId, email.threadId, {
              limit: ORCHESTRATOR_CONSTANTS.THREAD_EMAILS_LIMIT,
              order: "ASC",
            })
          : Promise.resolve([]),
        this.protoCategoriesService.findActiveByUser(userId),
      ]);
    tracker.endPhase("dataFetch");
    tracker.startPhase("processing");

    this.priorityService.calculateBasicPriorityScore(email, contexts);
    const replyStatus = this.determineThreadReplyStatus(threadEmails, email);
    const userContext = this.priorityBatchService.buildUserContext(
      contexts,
      protoCategories,
    );
    this.logger.log(
      `[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, ORCHESTRATOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}..., subject: ${email.subject?.substring(0, ORCHESTRATOR_CONSTANTS.SUBJECT_PREVIEW_LENGTH)}...)`,
    );

    // For QA-related emails, always use raw body so the categorisation LLM sees
    // the actual pass/fail verdict — summaries may strip it out (fixes #1453 Bug 1).
    const isQaRelated =
      QA_KEYWORD_REGEX.test(email.subject || "") ||
      QA_KEYWORD_REGEX.test(
        email.body?.substring(0, QA_KEYWORD_SCAN.QA_KEYWORD_BODY_SCAN_CHARS) ||
          "",
      );
    const bodyForPriority =
      !isQaRelated && email.summary?.trim()
        ? email.summary
        : cleanEmailContent(
            email.body,
            email.htmlBody,
            BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
          );

    tracker.endPhase("processing");
    tracker.startPhase("llmCall");

    const llmResult = await this.priorityAnalysisService.analyzePriority({
      email: {
        from: email.from || "",
        fromName: email.fromName,
        senderJobTitle: email.senderJobTitle,
        subject: email.subject || "",
        body: bodyForPriority,
      },
      userHistory: { averageTimeToReply: avgTimeToReply },
      userId,
      userContext,
      threadInfo: replyStatus,
      preComputedSentimentScore: email.sentimentScore ?? undefined,
    });

    tracker.endPhase("llmCall");
    tracker.startPhase("dbUpdate");

    await this.priorityResultService.applyPriorityResult(
      email,
      llmResult,
      contexts,
      userId,
      workerId,
    );
    tracker.endPhase("dbUpdate");
    this.logger.log(
      `[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, ORCHESTRATOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...)`,
    );

    // Instrument priority analysis call for redundancy tracking (issue #1595)
    await this.debugService.log(
      DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING,
      userId,
      {
        threadId: email.threadId ?? null,
        emailCount: threadEmails.length,
        caller: "runFullPriorityRefinement",
        callerFile: "llm-processor.ts",
        emailId,
        jobType: "REFINE_PRIORITY",
      },
    );
  }

  private async handleRefinePriorityJob(job: PgBoss.Job): Promise<void> {
    const { userId, emailId, forceRecalculate } = job.data as {
      userId: string;
      emailId: string;
      forceRecalculate?: boolean;
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.REFINE_PRIORITY,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, emailId, forceRecalculate });
    this.logger.log(
      `[Worker ${workerId}] Starting LLM priority refinement for email ${emailId}`,
    );

    try {
      const fetchResult = await this.fetchEmailForPriority(
        userId,
        emailId,
        forceRecalculate,
        workerId,
        tracker,
      );
      if (!fetchResult) return;
      const { email, thread } = fetchResult;

      const incrementalResult =
        await this.summaryProcessorService.tryIncrementalAnalysis({
          thread,
          email,
          forceRecalculate,
          userId,
          workerId,
          tracker,
        });
      if (incrementalResult.handled) return;

      await this.runFullPriorityRefinement({
        userId,
        emailId,
        email,
        thread,
        workerId,
        tracker,
      });
      tracker.finish();
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Failed to refine priority for email ${emailId}`,
        error,
      );
      const emailForCleanup = await this.emailsService.getEmailById(
        userId,
        emailId,
      );
      if (emailForCleanup?.emailThreadId) {
        await this.emailThreadRepository.update(
          { id: emailForCleanup.emailThreadId },
          { isProcessingPriority: false },
        );
      }
      tracker.finish(error as Error);
      throw error;
    }
  }

  private async handleRefinePriorityBatchJob(job: PgBoss.Job): Promise<void> {
    const { userId, emailIds } = job.data as {
      userId: string;
      emailIds: string[];
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, emailId: emailIds.join(",") });
    this.logger.log(
      `[Worker ${workerId}] Starting BATCH priority refinement for ${emailIds.length} emails`,
    );

    let threadIdsToLock: string[] = [];
    try {
      threadIdsToLock = await this.priorityBatchService.runBatchRefinement(
        userId,
        emailIds,
        workerId,
        tracker,
      );
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Failed batch priority refinement`,
        error,
      );
      await this.priorityBatchService.cleanupBatchOnError(
        userId,
        emailIds,
        threadIdsToLock,
      );
      tracker.finish(error as Error);
      throw error;
    }
  }

  private determineThreadReplyStatus(
    threadEmails: Email[],
    email: Email,
  ): {
    daysSinceLastReply: number | undefined;
    userShouldReply: boolean;
    lastReplyFrom: string | undefined;
  } {
    let userShouldReply = false;
    let daysSinceLastReply: number | undefined;
    let lastReplyFrom: string | undefined;

    if (threadEmails.length > 0 && email.receivedAt) {
      const lastEmail = threadEmails[threadEmails.length - 1];
      if (
        lastEmail.from &&
        email.from &&
        lastEmail.from.toLowerCase() === email.from.toLowerCase()
      ) {
        userShouldReply = true;
        const userLastEmail = [...threadEmails]
          .reverse()
          .find(
            (emailEntry) =>
              emailEntry.from &&
              emailEntry.from.toLowerCase() !== email.from!.toLowerCase(),
          );
        if (userLastEmail && userLastEmail.receivedAt) {
          const daysDiff =
            (email.receivedAt.getTime() - userLastEmail.receivedAt.getTime()) /
            MILLISECONDS.DAY;
          daysSinceLastReply = Math.max(0, Math.round(daysDiff * 10) / 10);
          lastReplyFrom = userLastEmail.from || undefined;
        }
      }
    }

    return { daysSinceLastReply, userShouldReply, lastReplyFrom };
  }
}
