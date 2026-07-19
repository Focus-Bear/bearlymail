import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Job } from "pg-boss";
import { In, Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import { ContactTypeClassifierService } from "../crm/contact-type-classifier.service";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { buildDeterministicSummary } from "../llm/email-content-cleaner";
import { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import { LLMCoreService } from "../llm/llm-core.service";
import { extractPlainSummary } from "../llm/llm-summary-utils";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { SummarizationService } from "../summarization/summarization.service";
import { parseCategoryName } from "../utils/category-name.util";
import { extractEmailAddress } from "../utils/email-address.utils";
import { EmailsService } from "./emails.service";
import {
  recategoriseFromSummary,
  threadNeedsLocalModelRecategorisation,
} from "./incremental-recategorise.helper";
import { IncrementalSummaryHelperService } from "./incremental-summary-helper.service";

type SummaryJobEntry = {
  job: Job<unknown>;
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
  actionItems: Array<{ description: string; confidence: number }> | null;
  meetingProposal: {
    hasProposal: boolean;
    proposedTime: string | null;
    proposedTimeText: string | null;
    topic: string | null;
    durationMinutes: number | null;
  } | null;
  error: unknown;
  // True when produced by the incremental path, which only updates the summary
  // text and does not recompute phishing/sentiment/category for the new email.
  incremental?: boolean;
};

// Constants for summary processing
const SUMMARY_PROCESSOR_CONSTANTS = {
  SUBSTRING_PREVIEW_LENGTH: 8,
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
    private readonly cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly incrementalSummaryHelper: IncrementalSummaryHelperService,
    private readonly categoryRulesService: CategoryRulesService,
    private readonly llmCoreService: LLMCoreService,
  ) {}

  async processSummaryJobBatch(
    jobArray: Job<unknown>[],
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
    jobArray: Job<unknown>[],
    tracker: JobPerformanceTracker,
  ): Promise<{
    jobsToProcess: SummaryJobEntry[];
    skipCount: { alreadyHasSummary: number; notFound: number };
  }> {
    tracker.startPhase("dataFetch");

    const skipCount = { alreadyHasSummary: 0, notFound: 0 };

    // Phase 1: fetch all emails (N+1 — pre-existing pattern).
    // Each fetch runs inside withUserKey so encrypted column transformers
    // see the per-user KMS data key in AsyncLocalStorage. Without this the
    // worker reads back garbage (fail-open ciphertext) for emails written
    // by paths that DID have the per-user key set (e.g. email-sync) — see #1980/#1981.
    const fetchedEntries: SummaryJobEntry[] = [];
    for (const job of jobArray) {
      const { userId, emailId } = job.data as {
        userId: string;
        emailId: string;
      };

      const email = await this.userEncryptionService.withUserKey(userId, () =>
        this.emailsService.getEmailById(userId, emailId),
      );

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for summary generation`);
        skipCount.notFound++;
        continue;
      }

      fetchedEntries.push({ job, userId, emailId, email });
    }

    // Phase 2: bulk-fetch lastSummarizedAt for all thread IDs that already
    // have a summary, so the per-email staleness check runs in-memory
    // without an extra query per email (avoids the N+1 pattern).
    const threadLastSummarizedMap =
      await this.buildThreadLastSummarizedMap(fetchedEntries);

    // Phase 3: filter candidates using the pre-fetched thread data
    const candidates: SummaryJobEntry[] = [];
    for (const entry of fetchedEntries) {
      const { email, emailId } = entry;
      if (
        email.summary &&
        email.summary.trim() !== "" &&
        !email.isProcessingSummary
      ) {
        const isStale = this.checkThreadStaleness(
          email,
          threadLastSummarizedMap,
        );
        if (!isStale) {
          skipCount.alreadyHasSummary++;
          continue;
        }
        this.logger.log(
          `Email ${emailId} has summary but thread summary is stale — re-generating`,
        );
      }

      candidates.push(entry);
    }

    const jobsToProcess = this.deduplicateByNewestThread(batchId, candidates);
    tracker.endPhase("dataFetch");
    return { jobsToProcess, skipCount };
  }

  /**
   * Bulk-fetches `lastSummarizedAt` for every thread whose emails already
   * have a summary. Returns a map of emailThreadId → lastSummarizedAt so
   * the per-email staleness check can run in-memory.
   */
  private async buildThreadLastSummarizedMap(
    fetchedEntries: SummaryJobEntry[],
  ): Promise<Map<string, Date | null>> {
    const entriesWithSummary = fetchedEntries.filter(
      ({ email }) =>
        email.summary &&
        email.summary.trim() !== "" &&
        !email.isProcessingSummary,
    );
    const threadIds = [
      ...new Set(
        entriesWithSummary
          .map(({ email }) => email.emailThreadId)
          .filter((id): id is string => id != null),
      ),
    ];
    const threadLastSummarizedMap = new Map<string, Date | null>();
    if (threadIds.length > 0) {
      const threads = await this.emailThreadRepository.find({
        where: { id: In(threadIds) },
        select: {
          id: true,
          lastSummarizedAt: true,
        },
      });
      for (const thread of threads) {
        threadLastSummarizedMap.set(thread.id, thread.lastSummarizedAt ?? null);
      }
    }
    return threadLastSummarizedMap;
  }

  /**
   * Returns true when the email arrived AFTER the thread's last full
   * summarization (or the thread has never been summarized), meaning the
   * existing summary does not include this email's content.
   *
   * Accepts a pre-fetched map of threadId → lastSummarizedAt to avoid
   * per-email database queries.
   */
  private checkThreadStaleness(
    email: Email,
    threadLastSummarizedMap: Map<string, Date | null>,
  ): boolean {
    if (!email.emailThreadId) return false;
    if (!threadLastSummarizedMap.has(email.emailThreadId)) return true;
    const lastSummarizedAt = threadLastSummarizedMap.get(email.emailThreadId);
    if (!lastSummarizedAt) return true;
    return email.receivedAt != null && email.receivedAt > lastSummarizedAt;
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
        const rules = await this.userEncryptionService.withUserKey(uid, () =>
          this.summarizationService.getSummarizationRules(uid),
        );
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

          // When the thread already has a summary, use incremental updates:
          // pass only unsummarised emails (received after lastSummarizedAt) to
          // the LLM rather than re-sending the entire thread every time.
          const incrementalSummary =
            await this.userEncryptionService.withUserKey(userId, () =>
              this.incrementalSummaryHelper.computeIncrementalSummary(
                userId,
                email,
              ),
            );
          if (incrementalSummary !== null) {
            return {
              emailId,
              email,
              summary: incrementalSummary as string,
              phishingConfidence: null,
              phishingReason: null,
              sentimentScore: null,
              sentimentExplanation: null,
              actionItems: null,
              meetingProposal: null,
              error: null,
              incremental: true,
            };
          }

          // No existing summary — full summarisation for this email only.
          // summarizeEmailWithAutoRule re-fetches the thread's other emails,
          // which are encrypted columns. Wrap with the user's KMS key so
          // those reads decrypt correctly under per-user envelope encryption.
          const result = await this.userEncryptionService.withUserKey(
            userId,
            () =>
              this.summarizationService.summarizeEmailWithAutoRule(
                userId,
                emailId,
                email,
                userRules,
              ),
          );
          return {
            emailId,
            email,
            summary: result.summary,
            phishingConfidence: result.phishingSignal?.confidence ?? null,
            phishingReason: result.phishingSignal?.reason ?? null,
            sentimentScore: result.sentimentScore,
            sentimentExplanation: result.sentimentExplanation,
            actionItems: result.actionItems ?? null,
            meetingProposal: result.meetingProposal ?? null,
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
            actionItems: null,
            meetingProposal: null,
            error,
          };
        }
      },
    );

    const results = await Promise.all(summaryPromises);
    tracker.endPhase("llmCall");
    return results;
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
      actionItems,
      meetingProposal,
      incremental,
    } = result;
    const threadEmails = await this.emailsService.getThreadEmails(
      jobEntry.userId,
      email.threadId,
    );
    const threadEmailIds = threadEmails.map((emailEntry) => emailEntry.id);

    await this.emailRepository.update(
      { id: In(threadEmailIds) },
      {
        summary: extractPlainSummary(summary!),
        summarySource: "llm" as const,
        isProcessingSummary: false,
        ...(sentimentScore !== null ? { sentimentScore } : {}),
        // The incremental path doesn't re-run phishing detection, so leave any
        // existing flags intact rather than overwriting them with null.
        ...(incremental
          ? {}
          : {
              phishingConfidence: phishingConfidence ?? null,
              phishingReason: phishingReason ?? null,
            }),
        ...(actionItems !== null ? { actionItemsJson: actionItems } : {}),
      },
    );

    if (email.emailThreadId) {
      const latestReceivedAt = threadEmails.reduce<Date>(
        (latest, threadEmail) => {
          const receivedAt = new Date(threadEmail.receivedAt);
          return receivedAt > latest ? receivedAt : latest;
        },
        new Date(0),
      );
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        {
          lastSummarizedAt: latestReceivedAt,
          aiProcessingDeferred: false,
          ...(meetingProposal !== null ? { meetingProposal } : {}),
        },
      );

      // A fresh background summary is exactly what the local-model path needs to
      // categorise a thread it left in "Other" with an unconfident category head
      // — do it with the cheap category-only call, not analyze_priority. Skipped
      // for incremental results (that path re-categorises itself).
      if (!incremental) {
        await this.maybeRecategoriseLocalModelThread(
          email.emailThreadId,
          email,
          jobEntry.userId,
          batchId,
        );
      }
    }

    const senderEmail = extractEmailAddress(email.from || "");
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

  /**
   * After a fresh background summary lands, re-categorise a thread the local
   * model left in "Other" because its category head was UNCONFIDENT
   * (`localModelDebug.categoryFallback`). Uses the cheap category-only
   * `categorise_summary` path (deterministic rules first, else the summary LLM)
   * — never the expensive `analyze_priority`, and the local priority is kept.
   * No-op for any other thread (confident category, confident "Other", or a
   * user/rule-pinned category, which the precedence guard protects anyway).
   * Best-effort: a failure here must not fail the summary write.
   */
  private async maybeRecategoriseLocalModelThread(
    emailThreadId: string,
    email: Email,
    userId: string,
    workerId: string,
  ): Promise<void> {
    try {
      const thread = await this.emailThreadRepository.findOne({
        where: { id: emailThreadId },
      });
      if (!thread || !threadNeedsLocalModelRecategorisation(thread)) {
        return;
      }
      const userContexts =
        await this.priorityCacheService.getUserContexts(userId);
      await recategoriseFromSummary(
        {
          categoryRulesService: this.categoryRulesService,
          emailThreadRepository: this.emailThreadRepository,
          getThreadSummary: (id) =>
            this.incrementalSummaryHelper.getThreadSummary(id),
          llmCoreService: this.llmCoreService,
          logger: this.logger,
        },
        { thread, email, userId, workerId, userContexts },
      );
    } catch (error) {
      this.logger.warn(
        `[Worker ${workerId}] Deferred local-model re-categorisation failed for thread ${emailThreadId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
          // Persist writes encrypted columns (summary, actionItemsJson,
          // categoryExplanation, meetingProposal). Wrap with the user's
          // KMS key so writes go out under per-user envelope encryption,
          // matching what the HTTP read path expects.
          await this.userEncryptionService.withUserKey(jobEntry.userId, () =>
            this.persistSingleSummaryResult(batchId, result, jobEntry),
          );
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
        // The LLM produced no summary (error or empty). Rather than leave the
        // email blank, fall back to a cheap deterministic summary from the body
        // so the inbox shows a preview. Tagged 'deterministic' so opening the
        // email re-triggers a real LLM summary. summary is a per-user encrypted
        // column, so the write must run inside withUserKey.
        await this.writeDeterministicFallback(batchId, result, jobsToProcess);
        failCount++;
      }
    }

    tracker.endPhase("dbUpdate");
    return { successCount, failCount };
  }

  /**
   * Writes a deterministic, non-LLM summary for an email whose LLM summary
   * failed, so it is never left blank. Falls back to just clearing the
   * processing flag when there is no usable body text or no job entry.
   */
  private async writeDeterministicFallback(
    batchId: string,
    result: SummaryLlmCallResult,
    jobsToProcess: SummaryJobEntry[],
  ): Promise<void> {
    const { emailId, email } = result;
    const jobEntry = jobsToProcess.find((j) => j.emailId === emailId);
    const fallback = buildDeterministicSummary(email?.body, email?.htmlBody);

    if (jobEntry && fallback) {
      try {
        await this.userEncryptionService.withUserKey(jobEntry.userId, () =>
          this.emailRepository.update(
            { id: emailId },
            {
              summary: fallback,
              summarySource: "deterministic" as const,
              isProcessingSummary: false,
            },
          ),
        );
        return;
      } catch (fallbackError) {
        this.logger.error(
          `[Worker ${batchId}] Failed to write deterministic summary fallback for email ${emailId}`,
          fallbackError,
        );
      }
    }

    await this.emailRepository.update(
      { id: emailId },
      { isProcessingSummary: false },
    );
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

  async tryIncrementalAnalysis({
    thread,
    email,
    forceRecalculate,
    userId,
    workerId,
    tracker,
  }: {
    thread: EmailThread | null;
    email: Email;
    forceRecalculate: boolean | undefined;
    userId: string;
    workerId: string;
    tracker: JobPerformanceTracker;
  }): Promise<{ handled: boolean }> {
    if (
      !thread ||
      forceRecalculate ||
      !this.canUseIncrementalAnalysis(thread)
    ) {
      return { handled: false };
    }

    const existingSummary =
      await this.incrementalSummaryHelper.getThreadSummary(email.emailThreadId);
    if (!existingSummary) return { handled: false };

    const threadPriorityExplanation = thread.priorityExplanation;
    const userContexts =
      await this.priorityCacheService.getUserContexts(userId);
    const categoryCtx = thread.categoryId
      ? userContexts.find((ctx) => ctx.contextId === thread.categoryId)
      : null;
    const resolvedCategory = categoryCtx
      ? parseCategoryName(categoryCtx.contextValue)
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

    this.logger.log(
      `[Worker ${workerId}] Incremental check: skipping full recalc for thread ${email.emailThreadId} - ${incrementalResult.reason}`,
    );

    await this.applyIncrementalUrgencyDelta(
      thread,
      email,
      incrementalResult.suggestedUrgencyDelta,
      workerId,
    );

    await this.incrementalSummaryHelper.updateSummaryIncrementally(
      email,
      existingSummary,
      userId,
    );

    // Re-categorise from the freshly-updated summary (deterministic rules →
    // summary-based LLM) INSTEAD of bailing to the full priority flow. This is
    // what catches a within-thread status flip (e.g. QA fail → QA pass): the
    // cheap `categoryMightChange` signal only reacts to a topic change, so we
    // no longer trust it to gate re-categorisation.
    await recategoriseFromSummary(
      {
        categoryRulesService: this.categoryRulesService,
        emailThreadRepository: this.emailThreadRepository,
        getThreadSummary: (id) =>
          this.incrementalSummaryHelper.getThreadSummary(id),
        llmCoreService: this.llmCoreService,
        logger: this.logger,
      },
      { thread, email, userId, workerId, userContexts },
    );

    tracker.finish();
    return { handled: true };
  }

  private async applyIncrementalUrgencyDelta(
    thread: EmailThread,
    email: Email,
    suggestedUrgencyDelta: number,
    workerId: string,
  ): Promise<void> {
    if (suggestedUrgencyDelta === 0 || !email.emailThreadId) return;

    const newUrgencyScore = Math.max(
      0,
      Math.min(100, (thread.urgencyScore || 0) + suggestedUrgencyDelta),
    );
    await this.emailThreadRepository.update(
      { id: email.emailThreadId },
      { urgencyScore: newUrgencyScore, isProcessingPriority: false },
    );
    this.logger.log(
      `[Worker ${workerId}] Applied incremental urgency delta: ${suggestedUrgencyDelta} (new score: ${newUrgencyScore})`,
    );
  }
}
