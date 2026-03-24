import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { In, IsNull, Not, Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import { ContactTypeClassifierService } from "../crm/contact-type-classifier.service";
import {
  Contact,
  DEFAULT_CONTACT_TYPES,
} from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { SummarizationService } from "../summarization/summarization.service";
import { EmailsService } from "./emails.service";

type SummaryJobEntry = {
  job: PgBoss.Job<unknown>;
  userId: string;
  emailId: string;
  email: Email;
};

type SummaryLlmCallResult = {
  emailId: string;
  email: Email;
  summary: string | null;
  phishingConfidence: "low" | "medium" | "high" | null;
  phishingReason: string | null;
  sentimentScore: number | null;
  sentimentExplanation: string | null;
  category: string | null;
  categoryExplanation: string | null;
  actionItems: Array<{ description: string; confidence: number }> | null;
  error: unknown;
};

// Constants for summary processing
const SUMMARY_PROCESSOR_CONSTANTS = {
  SUBSTRING_PREVIEW_LENGTH: 8,
  CONTACT_TYPE_CONFIDENCE_THRESHOLD: 0.6,
} as const;

/**
 * Domain service for email summary job processing and incremental analysis.
 * Extracted from LLMProcessor (Phase 7b, issue #939).
 */
@Injectable()
export class LLMSummaryProcessorService {
  private readonly logger = new Logger(LLMSummaryProcessorService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly emailsService: EmailsService,
    private readonly summarizationService: SummarizationService,
    private readonly incrementalAnalysisService: IncrementalAnalysisService,
    private readonly priorityCacheService: PriorityCacheService,
    private readonly contactTypeClassifierService: ContactTypeClassifierService,
    private readonly protoCategoriesService: ProtoCategoriesService,
    private readonly cloudWatchService: CloudWatchService,
  ) {}

  async processSummaryJobBatch(
    jobArray: PgBoss.Job<unknown>[],
    batchId: string,
    tracker: JobPerformanceTracker,
  ): Promise<void> {
    try {
      const { jobsToProcess, skipCount } =
        await this.collectSummaryJobsToProcess(batchId, jobArray, tracker);

      if (jobsToProcess.length === 0) {
        this.logger.log(
          `[Worker ${batchId}] No threads need summarization (skipped: ${skipCount.alreadyHasSummary} already have summaries, ${skipCount.notFound} not found)`,
        );
        tracker.finish();
        return;
      }

      const rulesMap = await this.fetchSummarizationRulesForJobs(jobsToProcess);

      this.logger.log(
        `[Worker ${batchId}] Firing ${jobsToProcess.length} parallel LLM calls (skipped ${skipCount.alreadyHasSummary + skipCount.notFound})`,
      );

      const results = await this.fireSummaryLlmCalls(
        batchId,
        jobsToProcess,
        rulesMap,
        tracker,
      );
      const { successCount, failCount } = await this.saveSummaryResults(
        batchId,
        results,
        jobsToProcess,
        tracker,
      );

      this.logger.log(
        `[Worker ${batchId}] Completed: ${successCount} succeeded, ${failCount} failed, ${skipCount.alreadyHasSummary + skipCount.notFound} skipped`,
      );
      tracker.finish();
    } catch (error) {
      this.logger.error(`[Worker ${batchId}] Batch processing failed`, error);

      for (const job of jobArray) {
        const { emailId } = job.data as { emailId: string };
        try {
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingSummary: false },
          );
        } catch (_updateError) {
          // Ignore update failure during error recovery
        }
      }

      tracker.finish(error as Error);
      throw error;
    }
  }

  private deduplicateByNewestThread(
    batchId: string,
    candidates: SummaryJobEntry[],
  ): SummaryJobEntry[] {
    const newestByThread = new Map<string, SummaryJobEntry>();
    const noThreadEntries: SummaryJobEntry[] = [];

    for (const entry of candidates) {
      const threadId = entry.email.emailThreadId;
      if (!threadId) {
        noThreadEntries.push(entry);
        continue;
      }
      const existing = newestByThread.get(threadId);
      if (!existing || entry.email.receivedAt > existing.email.receivedAt) {
        newestByThread.set(threadId, entry);
      }
    }

    const jobsToProcess = [...noThreadEntries, ...newestByThread.values()];
    const dedupSkipCount = candidates.length - jobsToProcess.length;
    if (dedupSkipCount > 0) {
      this.logger.log(
        `[Batch ${batchId}] Per-thread dedup: skipped ${dedupSkipCount} older same-thread summary jobs (kept newest per thread)`,
      );
    }
    return jobsToProcess;
  }

  private async collectSummaryJobsToProcess(
    batchId: string,
    jobArray: PgBoss.Job<unknown>[],
    tracker: JobPerformanceTracker,
  ): Promise<{
    jobsToProcess: SummaryJobEntry[];
    skipCount: { alreadyHasSummary: number; notFound: number };
  }> {
    tracker.startPhase("dataFetch");

    const candidates: SummaryJobEntry[] = [];
    const skipCount = { alreadyHasSummary: 0, notFound: 0 };

    for (const job of jobArray) {
      const { userId, emailId } = job.data as {
        userId: string;
        emailId: string;
      };

      const email = await this.emailsService.getEmailById(userId, emailId);

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for summary generation`);
        skipCount.notFound++;
        continue;
      }

      if (
        email.summary &&
        email.summary.trim() !== "" &&
        !email.isProcessingSummary
      ) {
        skipCount.alreadyHasSummary++;
        continue;
      }

      candidates.push({ job, userId, emailId, email });
    }

    const jobsToProcess = this.deduplicateByNewestThread(batchId, candidates);
    tracker.endPhase("dataFetch");
    return { jobsToProcess, skipCount };
  }

  private async fetchSummarizationRulesForJobs(
    jobsToProcess: SummaryJobEntry[],
  ): Promise<
    Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >
  > {
    const uniqueUserIds = [...new Set(jobsToProcess.map((j) => j.userId))];
    const rulesMap = new Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >();
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const rules =
          await this.summarizationService.getSummarizationRules(uid);
        rulesMap.set(uid, rules);
      }),
    );
    return rulesMap;
  }

  private async fireSummaryLlmCalls(
    batchId: string,
    jobsToProcess: SummaryJobEntry[],
    rulesMap: Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >,
    tracker: JobPerformanceTracker,
  ): Promise<SummaryLlmCallResult[]> {
    tracker.startPhase("llmCall");

    const summaryPromises = jobsToProcess.map(
      async ({ userId, emailId, email }) => {
        try {
          const userRules = rulesMap.get(userId) || [];
          const result =
            await this.summarizationService.summarizeEmailWithAutoRule(
              userId,
              emailId,
              email,
              userRules,
            );
          return {
            emailId,
            email,
            summary: result.summary,
            phishingConfidence: result.phishingSignal?.confidence ?? null,
            phishingReason: result.phishingSignal?.reason ?? null,
            sentimentScore: result.sentimentScore,
            sentimentExplanation: result.sentimentExplanation,
            category: result.category,
            categoryExplanation: result.categoryExplanation,
            actionItems: result.actionItems ?? null,
            error: null,
          };
        } catch (error) {
          this.logger.error(
            `[Worker ${batchId}] LLM call failed for email ${emailId}`,
            error,
          );
          return {
            emailId,
            email,
            summary: null,
            phishingConfidence: null,
            phishingReason: null,
            sentimentScore: null,
            sentimentExplanation: null,
            category: null,
            categoryExplanation: null,
            actionItems: null,
            error,
          };
        }
      },
    );

    const results = await Promise.all(summaryPromises);
    tracker.endPhase("llmCall");
    return results;
  }

  extractEmailAddress(from: string): string {
    if (!from) return "";
    const match = from.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase().trim();
    return from.toLowerCase().trim();
  }

  private async persistSingleSummaryResult(
    batchId: string,
    result: SummaryLlmCallResult,
    jobEntry: SummaryJobEntry,
  ): Promise<boolean> {
    const {
      email,
      summary,
      phishingConfidence,
      phishingReason,
      sentimentScore,
      category,
      categoryExplanation,
      actionItems,
    } = result;
    const threadEmails = await this.emailsService.getThreadEmails(
      jobEntry.userId,
      email.threadId,
      { limit: 50 },
    );
    const threadEmailIds = threadEmails.map((emailEntry) => emailEntry.id);

    await this.emailRepository.update(
      { id: In(threadEmailIds) },
      {
        summary: summary!,
        isProcessingSummary: false,
        ...(sentimentScore !== null ? { sentimentScore } : {}),
        phishingConfidence: phishingConfidence ?? null,
        phishingReason: phishingReason ?? null,
        ...(actionItems !== null ? { actionItemsJson: actionItems } : {}),
      },
    );

    if (email.emailThreadId) {
      let matchedCategoryId: string | null = null;
      if (category && category !== "Other") {
        const matched =
          await this.protoCategoriesService.findMatchingFullCategory(
            jobEntry.userId,
            category,
          );
        if (matched) {
          matchedCategoryId = matched.contextId;
        }
      }
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        {
          lastSummarizedAt: new Date(),
          ...(category
            ? { categoryExplanation: categoryExplanation ?? undefined }
            : {}),
          ...(matchedCategoryId !== null
            ? { categoryId: matchedCategoryId }
            : {}),
        },
      );
    }

    const senderEmail = this.extractEmailAddress(email.from || "");
    if (senderEmail) {
      try {
        await this.contactTypeClassifierService.autoClassifyIfNeeded(
          jobEntry.userId,
          senderEmail,
          {
            from: email.from || "",
            fromName: email.fromName || "",
            subject: email.subject || "",
            body: email.body || "",
          },
        );
      } catch (classificationError) {
        this.logger.warn(
          `[Worker ${batchId}] Contact type auto-classification failed for ${senderEmail}: ${classificationError}`,
        );
      }
    }

    this.logger.debug(
      `[Worker ${batchId}] Updated thread ${email.threadId?.substring(0, SUMMARY_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... (${threadEmailIds.length} emails)`,
    );
    return true;
  }

  private async saveSummaryResults(
    batchId: string,
    results: SummaryLlmCallResult[],
    jobsToProcess: SummaryJobEntry[],
    tracker: JobPerformanceTracker,
  ): Promise<{ successCount: number; failCount: number }> {
    tracker.startPhase("dbUpdate");
    let successCount = 0;
    let failCount = 0;

    for (const result of results) {
      const { emailId, summary, error } = result;
      if (summary && !error) {
        try {
          const jobEntry = jobsToProcess.find((j) => j.emailId === emailId);
          if (!jobEntry) continue;
          await this.persistSingleSummaryResult(batchId, result, jobEntry);
          successCount++;
        } catch (dbError) {
          this.logger.error(
            `[Worker ${batchId}] Failed to update summary for email ${emailId}`,
            dbError,
          );
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingSummary: false },
          );
          failCount++;
        }
      } else {
        await this.emailRepository.update(
          { id: emailId },
          { isProcessingSummary: false },
        );
        failCount++;
      }
    }

    tracker.endPhase("dbUpdate");
    return { successCount, failCount };
  }

  // ─── Incremental Analysis ────────────────────────────────────────────────

  canUseIncrementalAnalysis(thread: EmailThread): boolean {
    const threadPriorityExplanation = thread.priorityExplanation;
    const existingBreakdown = threadPriorityExplanation?.breakdown || [];
    const hasValidBreakdown =
      existingBreakdown.length > 0 &&
      existingBreakdown.some(
        (item) => item.value !== 0 && item.value !== undefined,
      );
    const hasOldStructure =
      threadPriorityExplanation?.breakdown?.some(
        (item) =>
          item.factor === "Base Score" ||
          item.factor === "🤖 AI Analysis" ||
          item.factor === "AI Analysis",
      ) ?? false;
    const hasCalculatingItems = existingBreakdown.some(
      (item) =>
        item.description === "Calculating..." ||
        item.description?.includes("Calculating..."),
    );
    return (
      hasValidBreakdown &&
      !hasOldStructure &&
      !hasCalculatingItems &&
      thread.categoryId !== null &&
      threadPriorityExplanation?.score !== undefined
    );
  }

  async buildIncrementalThreadContext(
    email: Email,
    userId: string,
  ): Promise<string> {
    const recentThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 3, order: "DESC" },
    );
    return this.incrementalAnalysisService.formatThreadContextForIncremental(
      recentThreadEmails
        .filter((emailEntry) => emailEntry.id !== email.id)
        .map((emailEntry) => ({
          from: emailEntry.from || "",
          fromName: emailEntry.fromName,
          subject: emailEntry.subject || "",
          body: emailEntry.summary || emailEntry.body || "",
          receivedAt: emailEntry.receivedAt || new Date(),
        })),
    );
  }

  async tryIncrementalAnalysis(
    thread: EmailThread | null,
    email: Email,
    forceRecalculate: boolean | undefined,
    userId: string,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<{ handled: boolean }> {
    if (
      !thread ||
      forceRecalculate ||
      !this.canUseIncrementalAnalysis(thread)
    ) {
      return { handled: false };
    }

    const existingSummary = await this.getThreadSummary(email.emailThreadId);
    if (!existingSummary) return { handled: false };

    const threadPriorityExplanation = thread.priorityExplanation;
    const userContexts =
      await this.priorityCacheService.getUserContexts(userId);
    const categoryCtx = thread.categoryId
      ? userContexts.find((ctx) => ctx.contextId === thread.categoryId)
      : null;
    const resolvedCategory = categoryCtx
      ? categoryCtx.contextValue.split(" - ")[0].trim()
      : null;
    const existingState = {
      priorityScore: threadPriorityExplanation?.score || 0,
      urgencyScore: thread.urgencyScore || 0,
      category: resolvedCategory,
      summary: existingSummary,
    };

    const newEmailData = {
      from: email.from || "",
      fromName: email.fromName,
      subject: email.subject || "",
      body: email.body || "",
      htmlBody: email.htmlBody,
      receivedAt: email.receivedAt || new Date(),
    };

    const threadContext = await this.buildIncrementalThreadContext(
      email,
      userId,
    );

    tracker.startPhase("incrementalCheck");
    const incrementalResult =
      await this.incrementalAnalysisService.checkIfRecalcNeeded(
        existingState,
        newEmailData,
        threadContext,
        undefined,
        userId,
      );
    tracker.endPhase("incrementalCheck");

    if (incrementalResult.needsFullRecalc) {
      this.logger.log(
        `[Worker ${workerId}] Incremental check: full recalc needed for thread ${email.emailThreadId} - ${incrementalResult.reason}`,
      );
      return { handled: false };
    }

    if (incrementalResult.categoryMightChange && email.emailThreadId) {
      this.logger.log(
        `[Worker ${workerId}] Incremental check: categoryMightChange=true for thread ${email.emailThreadId} — triggering full recalc for re-categorization`,
      );
      return { handled: false };
    }

    this.logger.log(
      `[Worker ${workerId}] Incremental check: skipping full recalc for thread ${email.emailThreadId} - ${incrementalResult.reason}`,
    );

    if (incrementalResult.suggestedUrgencyDelta !== 0 && email.emailThreadId) {
      const newUrgencyScore = Math.max(
        0,
        Math.min(
          100,
          (thread.urgencyScore || 0) + incrementalResult.suggestedUrgencyDelta,
        ),
      );
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        { urgencyScore: newUrgencyScore, isProcessingPriority: false },
      );
      this.logger.log(
        `[Worker ${workerId}] Applied incremental urgency delta: ${incrementalResult.suggestedUrgencyDelta} (new score: ${newUrgencyScore})`,
      );
    }

    await this.updateSummaryIncrementally(email, existingSummary, userId);
    tracker.finish();
    return { handled: true };
  }

  async getThreadSummary(
    emailThreadId: string | undefined,
  ): Promise<string | null> {
    if (!emailThreadId) {
      return null;
    }
    const emailWithSummary = await this.emailRepository.findOne({
      where: { emailThreadId, summary: Not(IsNull()) },
      select: ["summary"],
    });
    return emailWithSummary?.summary || null;
  }

  async updateSummaryIncrementally(
    email: Email,
    existingSummary: string,
    userId: string,
  ): Promise<void> {
    try {
      const senderEmail = this.extractEmailAddress(email.from || "");
      let needsContactTypeGuess = false;
      let contact: Contact | null = null;

      if (senderEmail) {
        const emailHash = SearchIndexHelper.hashExact(senderEmail);
        contact = await this.contactRepository.findOne({
          where: { userId, emailHash },
          select: ["id", "contactType", "contactTypeAutoDetected"],
        });

        if (
          contact &&
          (!contact.contactType || contact.contactTypeAutoDetected)
        ) {
          needsContactTypeGuess = true;
        }
      }

      const newEmailData = {
        from: email.from || "",
        fromName: email.fromName,
        subject: email.subject || "",
        body: email.body || "",
        htmlBody: email.htmlBody,
        receivedAt: email.receivedAt || new Date(),
      };

      const result =
        await this.incrementalAnalysisService.updateSummaryIncrementally(
          existingSummary,
          newEmailData,
          false,
          undefined,
          userId,
          needsContactTypeGuess,
        );

      if (result.updatedSummary && result.updatedSummary !== existingSummary) {
        if (email.emailThreadId) {
          const threadEmails = await this.emailRepository.find({
            where: { emailThreadId: email.emailThreadId },
            select: ["id"],
          });
          const threadEmailIds = threadEmails.map(
            (emailEntry) => emailEntry.id,
          );

          await this.emailRepository.update(
            { id: In(threadEmailIds) },
            { summary: result.updatedSummary, isProcessingSummary: false },
          );

          await this.emailThreadRepository.update(
            { id: email.emailThreadId },
            { lastSummarizedAt: new Date() },
          );

          this.logger.log(
            `Updated summary incrementally for thread ${email.emailThreadId} (${threadEmailIds.length} emails)`,
          );
        }
      }

      if (
        needsContactTypeGuess &&
        contact &&
        result.suggestedContactType &&
        (result.contactTypeConfidence ?? 0) >=
          SUMMARY_PROCESSOR_CONSTANTS.CONTACT_TYPE_CONFIDENCE_THRESHOLD
      ) {
        if (
          DEFAULT_CONTACT_TYPES.includes(
            result.suggestedContactType as (typeof DEFAULT_CONTACT_TYPES)[number],
          )
        ) {
          await this.contactRepository.update(contact.id, {
            contactType: result.suggestedContactType,
            contactTypeAutoDetected: true,
          });
          this.logger.log(
            `Auto-classified contact ${senderEmail} as ${result.suggestedContactType} (confidence: ${result.contactTypeConfidence})`,
          );
        }
      }
    } catch (error) {
      this.logger.warn("Failed to update summary incrementally:", error);
    }
  }
}
