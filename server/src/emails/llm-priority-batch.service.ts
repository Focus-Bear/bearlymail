import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { In, Repository } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import {
  BODY_PREVIEW_LENGTHS,
  QA_KEYWORD_REGEX,
  QA_KEYWORD_SCAN,
} from "../constants/llm-constants";
import { MAX_PRIORITY_RETRIES } from "../constants/priority-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { DebugService } from "../debug/debug.service";
import { DEBUG_FEATURES } from "../debug/debug-feature-names";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import {
  BatchPriorityResult,
  PriorityAnalysisService,
} from "../llm/priority-analysis.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
import { parseCategoryValue } from "../utils/category-name.util";
import { EmailsService } from "./emails.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

/** Delay in seconds before re-queuing a fallback email for retry. */
const PRIORITY_RETRY_DELAY_SECONDS = 60;

type UserContextInput = Array<{
  contextKey: string;
  contextValue: string;
  explanation?: string | null;
  priority?: number | null;
}>;
type ProtoCategoryInput = Array<{ name: string; description?: string | null }>;

/**
 * Domain service for batch email priority processing.
 * Handles prepareBatchEmails, applyBatchResults, runBatchRefinement, etc.
 * Extracted from LLMProcessor (Phase 7b, issue #939).
 */
@Injectable()
export class LLMPriorityBatchService {
  private readonly logger = new Logger(LLMPriorityBatchService.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly emailsService: EmailsService,
    private readonly priorityAnalysisService: PriorityAnalysisService,
    private readonly priorityCacheService: PriorityCacheService,
    private readonly priorityResultService: LLMPriorityResultService,
    private readonly summaryProcessorService: LLMSummaryProcessorService,
    private readonly protoCategoriesService: ProtoCategoriesService,
    private readonly debugService: DebugService,
  ) {}

  private async checkHasNewEmails(
    thread: EmailThread | null,
    email: Email,
    threadPriorityExplanation: { calculatedAt?: string } | null | undefined,
  ): Promise<boolean> {
    if (!thread || !email.receivedAt || !email.emailThreadId) {
      return false;
    }

    const mostRecentEmail = await this.emailRepository.findOne({
      where: { emailThreadId: email.emailThreadId },
      order: { receivedAt: "DESC" },
      select: ["id", "receivedAt"],
    });

    if (!mostRecentEmail) return false;

    const priorityCalculatedAt = threadPriorityExplanation?.calculatedAt
      ? new Date(threadPriorityExplanation.calculatedAt)
      : null;
    const lastCalculationTime =
      priorityCalculatedAt || thread.updatedAt || thread.createdAt;

    if (mostRecentEmail.id === email.id) {
      return email.receivedAt > lastCalculationTime;
    }
    return Boolean(
      mostRecentEmail.receivedAt &&
      mostRecentEmail.receivedAt > lastCalculationTime,
    );
  }

  async shouldSkipPriorityRecalculation(
    thread: EmailThread | null,
    forceRecalculate: boolean | undefined,
    email: Email,
    workerId: string,
    emailId: string,
  ): Promise<boolean> {
    const threadPriorityExplanation = thread?.priorityExplanation;
    const hasOldStructure =
      threadPriorityExplanation?.breakdown?.some(
        (item) =>
          item.factor === "Base Score" ||
          item.factor === "🤖 AI Analysis" ||
          item.factor === "AI Analysis",
      ) ?? false;

    const existingBreakdown = threadPriorityExplanation?.breakdown || [];
    const hasValidBreakdown =
      existingBreakdown.length > 0 &&
      existingBreakdown.some(
        (item) => item.value !== 0 && item.value !== undefined,
      );

    const hasCalculatingItems = existingBreakdown.some(
      (item) =>
        item.description === "Calculating..." ||
        item.description?.includes("Calculating..."),
    );

    const hasNewEmails = await this.checkHasNewEmails(
      thread,
      email,
      threadPriorityExplanation,
    );

    if (
      !forceRecalculate &&
      threadPriorityExplanation?.breakdown &&
      existingBreakdown.length > 0 &&
      hasValidBreakdown &&
      !hasCalculatingItems &&
      !thread?.isProcessingPriority &&
      !hasOldStructure &&
      !hasNewEmails
    ) {
      const existingScore = existingBreakdown.reduce(
        (sum, item) => sum + (item.value || 0),
        0,
      );
      this.logger.log(
        `[Worker ${workerId}] Skipping priority refinement for email ${emailId} - already has priority breakdown with score: ${existingScore}`,
      );
      return true;
    }

    if (forceRecalculate) {
      this.logger.log(
        `[Worker ${workerId}] Force recalculating priority for email ${emailId} (forceRecalculate=true)`,
      );
    }
    if (hasNewEmails) {
      this.logger.log(
        `[Worker ${workerId}] Forcing priority recalculation for thread ${email.emailThreadId} due to new emails`,
      );
    }
    if (hasOldStructure || !hasValidBreakdown || hasCalculatingItems) {
      let reason: string;
      if (hasOldStructure) {
        reason = "old";
      } else if (hasCalculatingItems) {
        reason = "calculating items";
      } else {
        reason = "incomplete";
      }
      this.logger.log(
        `[Worker ${workerId}] Detected ${reason} priority structure for thread ${email.emailThreadId}, recalculating`,
      );
    }

    return false;
  }

  async prepareBatchEmails(
    userId: string,
    emailIds: string[],
    workerId: string,
  ): Promise<{
    emailsToProcess: Email[];
    contexts: UserContext[];
    protoCategories: Array<{ name: string; description?: string | null }>;
  }> {
    const [emailResults, contexts, protoCategories] = await Promise.all([
      Promise.all(
        emailIds.map((emailId) =>
          this.emailsService.getEmailById(userId, emailId),
        ),
      ),
      this.priorityCacheService.getUserContexts(userId),
      this.protoCategoriesService.findActiveByUser(userId),
    ]);

    const uniqueThreadIds = [
      ...new Set(
        emailResults
          .filter(Boolean)
          .map((emailEntry) => emailEntry!.emailThreadId)
          .filter(Boolean) as string[],
      ),
    ];
    const threads =
      uniqueThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(uniqueThreadIds) },
          })
        : [];
    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));

    const emailsToProcess = (
      await Promise.all(
        emailResults
          .filter(
            (emailEntry): emailEntry is NonNullable<typeof emailEntry> =>
              !!emailEntry,
          )
          .map(async (email) => {
            const thread = email.emailThreadId
              ? (threadMap.get(email.emailThreadId) ?? null)
              : null;
            const shouldSkip = await this.shouldSkipPriorityRecalculation(
              thread,
              false,
              email,
              workerId,
              email.id,
            );
            return shouldSkip ? null : email;
          }),
      )
    ).filter(
      (emailEntry): emailEntry is NonNullable<typeof emailEntry> =>
        !!emailEntry,
    );

    return {
      emailsToProcess,
      contexts: contexts as UserContext[],
      protoCategories,
    };
  }

  async applyBatchResults(
    workerId: string,
    userId: string,
    emailsToProcess: Email[],
    batchResults: Map<string, BatchPriorityResult>,
    contexts: Array<{ contextKey: string; contextValue: string }>,
  ): Promise<void> {
    for (const email of emailsToProcess) {
      const llmResult = batchResults.get(email.id);
      if (!llmResult) {
        this.logger.warn(
          `[Worker ${workerId}] No batch LLM result for email ${email.id} — skipping DB write to preserve existing priority`,
        );
        continue;
      }
      if (llmResult.isFallback || llmResult.triagePreserved) {
        this.logger.warn(
          `[Worker ${workerId}] Skipping ${llmResult.triagePreserved ? "triage-preserved" : "fallback"} result for email ${email.id} — preserving existing priority score`,
        );
        continue;
      }
      try {
        await this.priorityResultService.applyPriorityResult(
          email,
          llmResult as Parameters<
            LLMPriorityResultService["applyPriorityResult"]
          >[1],
          contexts,
          userId,
          workerId,
        );
      } catch (updateError) {
        this.logger.error(
          `[Worker ${workerId}] Failed to update priority for email ${email.id}:`,
          updateError,
        );
      }
    }
  }

  buildBatchEmailPayloads(
    emailsToProcess: Email[],
    threadMap?: Map<string, EmailThread>,
    categoryMap?: Map<string, string>,
  ): Array<{
    emailKey: string;
    from: string;
    fromName?: string;
    senderJobTitle?: string;
    subject: string;
    body: string;
    preComputedSentimentScore?: number;
    existingUrgencyScore?: number;
    existingCategory?: string;
  }> {
    return emailsToProcess.map((email) => {
      // For QA-related emails, always use raw body so the categorisation LLM sees
      // the actual pass/fail verdict — summaries may strip it out (fixes #1453 Bug 1).
      const isQaRelated =
        QA_KEYWORD_REGEX.test(email.subject || "") ||
        QA_KEYWORD_REGEX.test(
          email.body?.substring(
            0,
            QA_KEYWORD_SCAN.QA_KEYWORD_BODY_SCAN_CHARS,
          ) || "",
        );
      const bodyForBatch =
        !isQaRelated && email.summary?.trim()
          ? email.summary
          : cleanEmailContent(
              email.body,
              email.htmlBody,
              BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
            );
      const thread =
        threadMap && email.emailThreadId
          ? threadMap.get(email.emailThreadId)
          : undefined;
      return {
        emailKey: email.id,
        from: email.from || "",
        fromName: email.fromName,
        senderJobTitle: email.senderJobTitle,
        subject: email.subject || "",
        body: bodyForBatch,
        preComputedSentimentScore: email.sentimentScore ?? undefined,
        existingUrgencyScore:
          thread?.urgencyScore !== undefined && thread.urgencyScore !== null
            ? thread.urgencyScore
            : undefined,
        existingCategory:
          thread?.categoryId && categoryMap
            ? categoryMap.get(thread.categoryId)
            : undefined,
      };
    });
  }

  /** Load a thread map for the given emails so callers can access existing urgency scores. */
  private async loadThreadMapForEmails(
    emails: Email[],
  ): Promise<Map<string, EmailThread>> {
    const threadIds = [
      ...new Set(
        emails.map((email) => email.emailThreadId).filter(Boolean) as string[],
      ),
    ];
    const threads =
      threadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(threadIds) },
          })
        : [];
    return new Map(threads.map((thread) => [thread.id, thread]));
  }

  async cleanupBatchOnError(
    userId: string,
    emailIds: string[],
    threadIdsToLock: string[],
  ): Promise<void> {
    if (threadIdsToLock.length > 0) {
      try {
        await this.emailThreadRepository.update(
          { id: In(threadIdsToLock) },
          { isProcessingPriority: false },
        );
      } catch {
        /* Ignore cleanup errors */
      }
      return;
    }
    for (const emailId of emailIds) {
      try {
        const email = await this.emailsService.getEmailById(userId, emailId);
        if (email?.emailThreadId) {
          await this.emailThreadRepository.update(
            { id: email.emailThreadId },
            { isProcessingPriority: false },
          );
        }
      } catch {
        /* Ignore cleanup errors */
      }
    }
  }

  async filterEmailsHandledIncrementally(
    emailsToProcess: Email[],
    userId: string,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<Email[]> {
    const uniqueThreadIds = [
      ...new Set(
        emailsToProcess.map((email) => email.emailThreadId).filter(Boolean),
      ),
    ] as string[];
    const threads: EmailThread[] =
      uniqueThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(uniqueThreadIds) },
          })
        : [];
    const threadMap = new Map<string, EmailThread>(
      threads.map((thread) => [thread.id, thread]),
    );

    const needsFullAnalysis: Email[] = [];
    for (const email of emailsToProcess) {
      const thread = email.emailThreadId
        ? (threadMap.get(email.emailThreadId) ?? null)
        : null;
      try {
        const incrementalResult =
          await this.summaryProcessorService.tryIncrementalAnalysis({
            thread,
            email,
            forceRecalculate: false,
            userId,
            workerId,
            tracker,
          });
        if (!incrementalResult.handled) {
          needsFullAnalysis.push(email);
        }
      } catch (error) {
        this.logger.error(
          `[Worker ${workerId}] Incremental analysis failed for email ${email.id}, falling back to full analysis`,
          error,
        );
        needsFullAnalysis.push(email);
      }
    }
    return needsFullAnalysis;
  }

  buildUserContext(
    contexts: UserContextInput,
    protoCategories: ProtoCategoryInput,
  ) {
    return {
      urgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.URGENT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      notUrgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.NOT_IMPORTANT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      goals: contexts
        .filter((item) => item.contextKey === ContextKey.MY_GOALS)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      workingOn: contexts
        .filter((item) => item.contextKey === ContextKey.WORKING_ON)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      dontCare: contexts
        .filter((category) => category.contextKey === ContextKey.DONT_CARE)
        .map((category) => ({ value: category.contextValue })),
      emailCategories: contexts
        .filter((category) => category.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((category) => {
          const { name, description } = parseCategoryValue(
            category.contextValue,
          );
          return { name, description: description ?? undefined };
        }),
      protoCategories: protoCategories.map((pc) => ({
        name: pc.name,
        description: pc.description || undefined,
      })),
    };
  }

  private extractThreadIds(emails: Email[]): string[] {
    return [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ] as string[];
  }

  private async unlockIncrementallyHandledThreads(
    workerId: string,
    allEmails: Email[],
    emailsNeedingFullAnalysis: Email[],
  ): Promise<void> {
    const allThreadIds = new Set(
      allEmails.map((email) => email.emailThreadId).filter(Boolean),
    ) as Set<string>;
    const fullAnalysisThreadIds = new Set(
      emailsNeedingFullAnalysis
        .map((email) => email.emailThreadId)
        .filter(Boolean),
    ) as Set<string>;
    const fullyHandledThreadIds = [...allThreadIds].filter(
      (threadId) => !fullAnalysisThreadIds.has(threadId),
    );
    if (fullyHandledThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { id: In(fullyHandledThreadIds) },
        { isProcessingPriority: false },
      );
      this.logger.log(
        `[Worker ${workerId}] Unlocked ${fullyHandledThreadIds.length} incrementally-handled threads`,
      );
    }
  }

  async runBatchRefinement(
    userId: string,
    emailIds: string[],
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<string[]> {
    tracker.startPhase("dataFetch");
    const { emailsToProcess, contexts, protoCategories } =
      await this.prepareBatchEmails(userId, emailIds, workerId);

    if (emailsToProcess.length === 0) {
      this.logger.log(`[Worker ${workerId}] No emails to process in batch`);
      tracker.finish();
      return [];
    }

    const threadIdsToLock = this.extractThreadIds(emailsToProcess);
    await this.lockThreadsForProcessing(threadIdsToLock);
    tracker.endPhase("dataFetch");
    tracker.startPhase("processing");

    const emailsNeedingFullAnalysis =
      await this.filterEmailsHandledIncrementally(
        emailsToProcess,
        userId,
        workerId,
        tracker,
      );

    await this.unlockIncrementallyHandledThreads(
      workerId,
      emailsToProcess,
      emailsNeedingFullAnalysis,
    );

    if (emailsNeedingFullAnalysis.length === 0) {
      this.logger.log(
        `[Worker ${workerId}] All ${emailsToProcess.length} batch emails handled incrementally`,
      );
      tracker.finish();
      return threadIdsToLock;
    }

    await this.runLlmAnalysisAndApply(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      {
        contexts,
        protoCategories,
        tracker,
      },
    );

    this.logger.log(
      `[Worker ${workerId}] Batch priority refinement complete: ${emailsNeedingFullAnalysis.length}/${emailsToProcess.length} emails needed full LLM analysis`,
    );
    tracker.finish();
    return threadIdsToLock;
  }

  private async runLlmAnalysisAndApply(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    opts: {
      contexts: UserContext[];
      protoCategories: ProtoCategoryInput;
      tracker: JobPerformanceTracker;
    },
  ): Promise<void> {
    const { contexts, protoCategories, tracker } = opts;
    const threadMapForPayload = await this.loadThreadMapForEmails(
      emailsNeedingFullAnalysis,
    );
    const categoryMap = new Map(
      contexts
        .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((ctx) => {
          const { name } = parseCategoryValue(ctx.contextValue);
          return [(ctx as UserContext).contextId, name] as const;
        }),
    );
    const batchEmails = this.buildBatchEmailPayloads(
      emailsNeedingFullAnalysis,
      threadMapForPayload,
      categoryMap,
    );
    tracker.endPhase("processing");
    tracker.startPhase("llmCall");

    const batchResults: Map<string, BatchPriorityResult> =
      await this.priorityAnalysisService.analyzePriorityBatch(
        batchEmails,
        this.buildUserContext(contexts, protoCategories),
        undefined,
        userId,
      );
    tracker.endPhase("llmCall");

    await this.applyResultsRequeueAndLog(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
      { contexts, tracker },
    );

    // Instrument each batch email for redundancy tracking (issue #1595)
    await this.debugService.logBatch(
      DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING,
      userId,
      this.buildPriorityDebugPayloads(emailsNeedingFullAnalysis),
    );
  }

  /**
   * Apply batch results, re-queue fallbacks, and log debug entries.
   * Extracted to keep runBatchRefinement within the max-statements limit.
   */
  private async applyResultsRequeueAndLog(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    batchResults: Map<string, BatchPriorityResult>,
    options: { contexts: UserContext[]; tracker: JobPerformanceTracker },
  ): Promise<void> {
    const { contexts, tracker } = options;
    tracker.startPhase("dbUpdate");
    await this.applyBatchResults(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
      contexts,
    );
    tracker.endPhase("dbUpdate");

    await this.requeueFallbackEmails(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
    );
  }

  private async lockThreadsForProcessing(
    threadIdsToLock: string[],
  ): Promise<void> {
    if (threadIdsToLock.length > 0) {
      await this.emailThreadRepository.update(
        { id: In(threadIdsToLock) },
        { isProcessingPriority: true },
      );
    }
  }

  private buildPriorityDebugPayloads(emails: Email[]): Array<{
    threadId: string | null;
    emailCount: number;
    caller: string;
    callerFile: string;
    emailId: string;
    jobType: string;
  }> {
    const threadEmailCountMap = new Map<string, number>();
    for (const email of emails) {
      if (email.threadId) {
        threadEmailCountMap.set(
          email.threadId,
          (threadEmailCountMap.get(email.threadId) ?? 0) + 1,
        );
      }
    }
    return emails.map((email) => ({
      threadId: email.threadId ?? null,
      emailCount: email.threadId
        ? (threadEmailCountMap.get(email.threadId) ?? 1)
        : 1,
      caller: "runBatchRefinement",
      callerFile: "llm-priority-batch.service.ts",
      emailId: email.id,
      jobType: "REFINE_PRIORITY_BATCH",
    }));
  }

  /**
   * Re-queue individual refine-priority jobs for any emails that received a
   * fallback (isFallback=true) result during batch analysis.  This prevents
   * emails from getting permanently stuck at score=0 when an LLM batch call
   * fails.  Each email is allowed at most MAX_PRIORITY_RETRIES attempts before
   * we give up (tracked via `priorityRetryCount` on the thread).
   */
  private async requeueFallbackEmails(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    batchResults: Map<string, BatchPriorityResult>,
  ): Promise<void> {
    const fallbackEmails = emailsNeedingFullAnalysis.filter((email) => {
      const result = batchResults.get(email.id);
      return !result || result.isFallback;
    });

    if (fallbackEmails.length === 0) return;

    this.logger.warn(
      `[Worker ${workerId}] ${fallbackEmails.length} email(s) received fallback results — scheduling individual retries`,
    );

    // Batch-load all threads upfront to avoid N+1 queries
    const threadIds = [
      ...new Set(
        fallbackEmails
          .map((email) => email.emailThreadId)
          .filter((id): id is string => !!id),
      ),
    ];
    const threads = await this.emailThreadRepository.find({
      where: { id: In(threadIds) },
      select: ["id", "priorityRetryCount"],
    });
    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));

    for (const email of fallbackEmails) {
      try {
        // Check retry count on the thread to avoid infinite loops
        if (email.emailThreadId) {
          const thread = threadMap.get(email.emailThreadId);

          if (thread && thread.priorityRetryCount >= MAX_PRIORITY_RETRIES) {
            this.logger.warn(
              `[Worker ${workerId}] Email ${email.id} (thread ${email.emailThreadId}) has reached MAX_PRIORITY_RETRIES (${MAX_PRIORITY_RETRIES}) — giving up`,
            );
            continue;
          }
        }

        // Send job first; only increment retry count after successful enqueue
        await this.boss.send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: email.id, isRetry: true },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-retry-${email.id}`,
            startAfter: new Date(
              Date.now() + PRIORITY_RETRY_DELAY_SECONDS * MILLISECONDS.SECOND,
            ),
          },
        );

        // Increment retry count only after successful boss.send()
        if (email.emailThreadId) {
          await this.emailThreadRepository.increment(
            { id: email.emailThreadId },
            "priorityRetryCount",
            1,
          );
        }

        this.logger.log(
          `[Worker ${workerId}] Queued retry for email ${email.id} (starts in ${PRIORITY_RETRY_DELAY_SECONDS}s)`,
        );
      } catch (err) {
        this.logger.error(
          `[Worker ${workerId}] Failed to queue retry for email ${email.id}:`,
          err,
        );
      }
    }
  }
}
