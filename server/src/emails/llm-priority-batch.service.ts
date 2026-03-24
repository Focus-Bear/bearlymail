import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import {
  BatchPriorityResult,
  PriorityAnalysisService,
} from "../llm/priority-analysis.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { EmailsService } from "./emails.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

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
      if (llmResult.isFallback) {
        this.logger.warn(
          `[Worker ${workerId}] Skipping fallback result for email ${email.id} — preserving existing priority score`,
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

  buildBatchEmailPayloads(emailsToProcess: Email[]): Array<{
    emailKey: string;
    from: string;
    fromName?: string;
    senderJobTitle?: string;
    subject: string;
    body: string;
    preComputedSentimentScore?: number;
  }> {
    return emailsToProcess.map((email) => {
      const bodyForBatch = email.summary?.trim()
        ? email.summary
        : cleanEmailContent(
            email.body,
            email.htmlBody,
            BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
          );
      return {
        emailKey: email.id,
        from: email.from || "",
        fromName: email.fromName,
        senderJobTitle: email.senderJobTitle,
        subject: email.subject || "",
        body: bodyForBatch,
        preComputedSentimentScore: email.sentimentScore ?? undefined,
      };
    });
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
          const parts = category.contextValue.split(" - ");
          return {
            name: parts[0].trim(),
            description:
              parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined,
          };
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
    if (threadIdsToLock.length > 0) {
      await this.emailThreadRepository.update(
        { id: In(threadIdsToLock) },
        { isProcessingPriority: true },
      );
    }
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

    const userContext = this.buildUserContext(contexts, protoCategories);
    const batchEmails = this.buildBatchEmailPayloads(emailsNeedingFullAnalysis);
    tracker.endPhase("processing");
    tracker.startPhase("llmCall");

    const batchResults: Map<string, BatchPriorityResult> =
      await this.priorityAnalysisService.analyzePriorityBatch(
        batchEmails,
        userContext,
        undefined,
        userId,
      );
    tracker.endPhase("llmCall");
    tracker.startPhase("dbUpdate");

    await this.applyBatchResults(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
      contexts,
    );
    tracker.endPhase("dbUpdate");
    this.logger.log(
      `[Worker ${workerId}] Batch priority refinement complete: ${emailsNeedingFullAnalysis.length}/${emailsToProcess.length} emails needed full LLM analysis`,
    );
    tracker.finish();
    return threadIdsToLock;
  }
}
