import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { IsNull, Not, Repository } from "typeorm";

import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BlockedKeywordsService } from "../blocked-keywords/blocked-keywords.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { SECONDS } from "../constants/time-constants";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { SuggestedRepliesService } from "../suggested-replies/suggested-replies.service";
import { UsersService } from "../users/users.service";
import { computeEmailHmac, computeRecipientsHmac } from "../utils/hmac-email";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailThreadService } from "./email-thread.service";
import { EmailDataWithOptionalThreadProps } from "./interfaces/email-data.interface";
import { PriorityBatchSchedulerService } from "./priority-batch-scheduler.service";

/**
 * Handles email creation pipeline, batch decisions, post-save jobs, and blocked email handling.
 * Extracted from EmailsService (Phase 3).
 */
@Injectable()
export class EmailLifecycleService {
  private readonly logger = new Logger(EmailLifecycleService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    private blockedSendersService: BlockedSendersService,
    private blockedKeywordsService: BlockedKeywordsService,
    private batchScheduleService: BatchScheduleService,
    private emailThreadService: EmailThreadService,
    private usersService: UsersService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly priorityBatchScheduler: PriorityBatchSchedulerService,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(forwardRef(() => SubscriptionsService))
    private subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => SuggestedRepliesService))
    private suggestedRepliesService?: SuggestedRepliesService,
  ) {}

  async createEmail(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    options?: { skipBatching?: boolean; countTowardVolume?: boolean },
    queueBatchPriorityRefinement?: (
      userId: string,
      emailId: string,
    ) => Promise<void>,
  ): Promise<Email> {
    const senderEmail = emailData.from || "";
    const subject = emailData.subject || "";
    const [isSenderBlocked, hasBlockedKeyword] = await Promise.all([
      this.blockedSendersService.isSenderBlocked(userId, senderEmail),
      this.blockedKeywordsService.checkSubjectForBlockedKeywords(
        userId,
        subject,
      ),
    ]);
    const isBlocked = isSenderBlocked || hasBlockedKeyword;

    const starCount = emailData.starCount ?? 0;
    const isArchived = isBlocked ? true : (emailData.isArchived ?? false);
    this.logCreateEmailEntry(
      userId,
      emailData,
      !!isBlocked,
      starCount,
      options,
    );
    const thread = await this.emailThreadService.getOrCreateEmailThread(
      userId,
      emailData.threadId!,
      starCount,
      isArchived,
    );

    const {
      starCount: _starCount,
      isArchived: _isArchived,
      ...emailDataWithoutThreadProps
    } = emailData;
    const emailDataToCreate: Partial<Email> = {
      ...emailDataWithoutThreadProps,
      userId,
      emailThreadId: thread.id,
    };
    this.logger.debug(
      `[EmailLifecycleService] Creating email ${emailDataToCreate.messageId} with labels: ${emailDataToCreate.labels ? "yes" : "no"}`,
    );

    const createdEntities = this.emailRepository.create(emailDataToCreate);
    const email = (
      Array.isArray(createdEntities) ? createdEntities[0] : createdEntities
    ) as Email;

    await this.assignHmacsAndContact(userId, email, emailData);

    if (isBlocked) {
      return this.saveBlockedEmail({
        userId,
        email,
        thread,
        isSenderBlocked,
        senderEmail,
        subject,
      });
    }

    const gate = await this.maybeSkipAiProcessing(
      userId,
      thread,
      email,
      options,
    );
    if (gate.saved) return gate.saved;
    // Over the volume cap we skip the expensive AI work but still run the batch
    // decision below, so the email is batched (not dumped into the inbox).
    const deferAi = gate.deferAiButBatch === true;

    thread.isProcessingPriority = !deferAi;
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = !deferAi;

    const batchResult = await this.determineBatchDecision(
      userId,
      thread,
      starCount,
      thread.priorityScore || 0,
      options,
    );
    email.batchDecisionReason = deferAi
      ? `AI skipped (org over email volume limit) — ${batchResult.batchDecisionReason}`
      : batchResult.batchDecisionReason;
    this.logBatchDecision(userId, thread, batchResult, starCount, options);

    return this.persistEmailAndQueueJobs({
      userId,
      email,
      thread,
      batchResult,
      deferAi,
      queueBatchPriorityRefinement,
    });
  }

  /** Persists the email, updates the thread, and (unless AI was deferred for
   * over-volume) enqueues the post-save AI refinement/summary jobs. */
  private async persistEmailAndQueueJobs(args: {
    userId: string;
    email: Email;
    thread: EmailThread;
    batchResult: Awaited<
      ReturnType<EmailLifecycleService["determineBatchDecision"]>
    >;
    deferAi: boolean;
    queueBatchPriorityRefinement?: (
      userId: string,
      emailId: string,
    ) => Promise<void>;
  }): Promise<Email> {
    const { userId, email, thread, batchResult, deferAi } = args;
    const savedEmail = await this.emailRepository.save(email);
    await this.updateThreadAfterSave(userId, thread, batchResult, savedEmail);
    this.logLabelsSaved(savedEmail);
    if (!deferAi) {
      await this.queuePostSaveJobs(
        userId,
        savedEmail,
        thread,
        args.queueBatchPriorityRefinement,
      );
    } else if (savedEmail.emailThreadId) {
      // Over volume we skip the expensive priority/summary AI work, but still run
      // thread-level automations users rely on (GitHub status, auto-responder,
      // workflows) — these are not the metered analyze_priority/summary jobs.
      this.queueThreadLevelJobs(userId, savedEmail, thread);
    }
    return savedEmail;
  }

  /**
   * Pre-AI degradation gates. Inactive users are terminal (`{ saved }`, delivered
   * immediately). Over the volume cap returns `{ deferAiButBatch: true }` — the
   * caller skips AI but still runs the batch decision so the email is batched,
   * not dumped. Neither firing returns `{}` (continue with full AI processing).
   */
  private async maybeSkipAiProcessing(
    userId: string,
    thread: EmailThread,
    email: Email,
    options?: { countTowardVolume?: boolean },
  ): Promise<{ saved?: Email; deferAiButBatch?: boolean }> {
    const deferredEmail = await this.maybeDeferInactiveUser(
      userId,
      thread,
      email,
    );
    if (deferredEmail) return { saved: deferredEmail };
    if (await this.isOverVolume(userId, options)) {
      // Mark the thread so it can be reprocessed when the cycle resets/upgrades.
      thread.aiProcessingDeferred = true;
      this.logger.warn(
        `Email over org volume limit — skipping AI but batching normally (thread ${thread.id})`,
      );
      return { deferAiButBatch: true };
    }
    return {};
  }

  private async maybeDeferInactiveUser(
    userId: string,
    thread: EmailThread,
    email: Email,
  ): Promise<Email | null> {
    const isActive = await this.usersService.isUserActive(userId);
    if (isActive) return null;
    this.recordImmediateDeliveryReason(
      thread,
      email,
      "Delivered immediately — AI processing deferred (user inactive)",
      "deferred_inactive",
    );
    thread.aiProcessingDeferred = true;
    thread.isProcessingPriority = false;
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = false;
    const savedEmail = await this.emailRepository.save(email);
    this.logger.log(
      `Skipping AI processing for user ${userId} (inactive >${process.env.AI_INACTIVITY_THRESHOLD_DAYS ?? "3"} days), thread ${thread.id}`,
    );
    return savedEmail;
  }

  /**
   * Meters an inbound email against the org's volume tier and reports whether the
   * tier is exhausted. Only live provider sync passes countTowardVolume —
   * historical scans and manual creation are never metered or gated.
   */
  private async isOverVolume(
    userId: string,
    options?: { countTowardVolume?: boolean },
  ): Promise<boolean> {
    if (!options?.countTowardVolume) return false;
    const volume = await this.subscriptionsService.trackEmailForUser(userId);
    return !!(volume && !volume.allowed);
  }

  private async assignHmacsAndContact(
    userId: string,
    email: Email,
    emailData: EmailDataWithOptionalThreadProps,
  ): Promise<void> {
    email.senderEmailHmac = computeEmailHmac(emailData.from ?? "");
    const toHmac = computeRecipientsHmac(emailData.to ?? null);
    const ccHmac = computeRecipientsHmac(emailData.cc ?? null);
    email.recipientEmailsHmac =
      toHmac || ccHmac ? [toHmac, ccHmac].filter(Boolean).join(",") : null;
    if (email.senderEmailHmac) {
      const senderContact = await this.contactRepository.findOne({
        where: { userId, emailHash: email.senderEmailHmac },
        select: {
          id: true,
        },
      });
      email.senderContactId = senderContact?.id ?? null;
    }
  }

  async determineBatchDecision(
    userId: string,
    thread: EmailThread,
    starCount: number,
    priorityScore: number,
    options?: { skipBatching?: boolean },
  ): Promise<{
    isBatched: boolean;
    batchReleaseAt: Date | null;
    wasDeliveredEarly: boolean;
    batchDecisionReason: string;
  }> {
    if (options?.skipBatching)
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Initial sync",
      };
    // Deliver immediately if the thread is starred and already visible in Action/Follow-Up.
    // "Visible" means not actively snoozed (isSnoozed flag is read before cancelThreadSnoozeIfNeeded clears it).
    const isActiveSnooze =
      thread.isSnoozed &&
      thread.snoozeUntil !== null &&
      thread.snoozeUntil > new Date();
    if (starCount > 0 && !isActiveSnooze) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: `Starred thread already visible in Action/Follow-Up — delivered immediately`,
      };
    }
    // Starred but snoozed: fall through to batch scheduling.
    // Snooze will be cleared, but the thread should only reappear immediately if priority is urgent.

    let schedule = await this.batchScheduleService.getSchedule(userId);
    if (!schedule) {
      const defaultScheduleData =
        this.batchScheduleService.getDefaultSchedule();
      schedule = {
        ...defaultScheduleData,
        userId,
        id: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BatchSchedule;
    }

    if (!schedule.isEnabled)
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Schedule disabled",
      };

    if (
      priorityScore >= PRIORITY_SCORES.HIGH_THRESHOLD &&
      schedule.urgentBypassSchedule
    ) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: `High priority (${priorityScore}) bypassed schedule`,
      };
    }

    const nextReleaseTime = this.batchScheduleService.getNextBatchReleaseTime(
      schedule,
      priorityScore,
    );
    if (nextReleaseTime !== null) {
      const existingReleaseAt = thread.batchReleaseAt;
      const now = new Date();
      const existingIsValidAndEarlier =
        existingReleaseAt !== null &&
        existingReleaseAt > now &&
        existingReleaseAt < nextReleaseTime;
      const effectiveReleaseTime = existingIsValidAndEarlier
        ? existingReleaseAt
        : nextReleaseTime;
      return {
        isBatched: true,
        batchReleaseAt: effectiveReleaseTime,
        wasDeliveredEarly: false,
        batchDecisionReason: `Batched until ${effectiveReleaseTime.toISOString()}`,
      };
    }

    return {
      isBatched: false,
      batchReleaseAt: null,
      wasDeliveredEarly: false,
      batchDecisionReason: "No upcoming delivery window",
    };
  }

  /**
   * Diagnostic for "emails delivered out of batches": records that the batch
   * decision actually ran and what it produced. Threads observed in prod had
   * isBatched=false + null reason (column defaults) — i.e. this point was never
   * reached — yet the code path looks unconditional. This log disambiguates
   * "never ran" vs "ran but false" vs "ran true then reset" on the next sync.
   */
  private logBatchDecision(
    userId: string,
    thread: EmailThread,
    batchResult: {
      isBatched: boolean;
      batchReleaseAt: Date | null;
      batchDecisionReason: string;
    },
    starCount: number,
    options?: { skipBatching?: boolean },
  ): void {
    this.logger.log(
      JSON.stringify({
        event: "batch_decision",
        userId,
        threadId: thread.threadId,
        isBatched: batchResult.isBatched,
        batchReleaseAt: batchResult.batchReleaseAt?.toISOString() ?? null,
        reason: batchResult.batchDecisionReason,
        priorityScoreAtDecision: thread.priorityScore || 0,
        starCount,
        skipBatching: options?.skipBatching ?? false,
      }),
    );
  }

  /**
   * Diagnostic for "emails delivered out of batches": proves createEmail ran for
   * this message and which gate (blocked / degraded / normal) it hits, so a null
   * batchDecisionReason can be traced to a specific path.
   */
  private logCreateEmailEntry(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    isBlocked: boolean,
    starCount: number,
    options?: { skipBatching?: boolean },
  ): void {
    this.logger.log(
      JSON.stringify({
        event: "batch_path",
        path: "create_email_entry",
        userId,
        threadId: emailData.threadId,
        messageId: emailData.messageId,
        isBlocked,
        starCount,
        skipBatching: options?.skipBatching ?? false,
      }),
    );
  }

  /**
   * Records why an email was delivered straight to the inbox on the degraded /
   * blocked paths that return BEFORE {@link determineBatchDecision} runs
   * (inactive user, org over-volume, blocked sender/keyword).
   *
   * These paths previously left `batchDecisionReason` null, so the Delivery
   * Debug panel showed "(none recorded)" — the exact symptom behind "emails
   * delivered out of batches": an email is delivered immediately, later gets its
   * priority/category backfilled by the deferred-reprocess path, and ends up
   * looking like a normal scored email that simply skipped the batch with no
   * explanation. Setting an explicit reason (and emitting a `batch_path` log)
   * surfaces the real cause in both the panel and the server logs.
   *
   * Sets the fields in-memory only; the caller persists `thread` and `email`.
   */
  private recordImmediateDeliveryReason(
    thread: EmailThread,
    email: Email,
    reason: string,
    path: string,
  ): void {
    thread.isBatched = false;
    thread.batchReleaseAt = null;
    thread.wasDeliveredEarly = false;
    thread.batchDecisionReason = reason;
    email.batchDecisionReason = reason;
    this.logger.log(
      JSON.stringify({
        event: "batch_path",
        path,
        userId: thread.userId,
        threadId: thread.threadId,
        messageId: email.messageId,
        reason,
      }),
    );
  }

  async updateThreadAfterSave(
    userId: string,
    thread: EmailThread,
    batchDecision: {
      isBatched: boolean;
      batchReleaseAt: Date | null;
      wasDeliveredEarly: boolean;
      batchDecisionReason: string;
    },
    triggerEmail?: Email,
  ): Promise<void> {
    const threadUpdate: Partial<EmailThread> = {
      updatedAt: new Date(),
      isBatched: batchDecision.isBatched,
      batchReleaseAt: batchDecision.batchReleaseAt,
      wasDeliveredEarly: batchDecision.wasDeliveredEarly,
      batchDecisionReason: batchDecision.batchDecisionReason,
    };
    await this.emailThreadRepository.update({ id: thread.id }, threadUpdate);
    await this.cancelThreadSnoozeIfNeeded(userId, thread, triggerEmail);
    await this.invalidateSuggestedActionsCache(thread.id);
  }

  async cancelThreadSnoozeIfNeeded(
    userId: string,
    thread: EmailThread,
    triggerEmail?: Email,
  ): Promise<void> {
    try {
      const snoozedEmailsInThread = await this.emailRepository.find({
        where: { emailThreadId: thread.id, userId, isSnoozed: true },
      });
      if (!thread.isSnoozed && snoozedEmailsInThread.length === 0) return;

      // Debug: log what triggered the snooze cancellation so we can understand
      // why threads appear in follow-up mode immediately after a reply is sent.
      if (triggerEmail) {
        this.logger.warn(
          `[DEBUG #2125] cancelThreadSnoozeIfNeeded triggered for thread ${thread.id}` +
            ` (threadId=${thread.threadId}, isSnoozed=${thread.isSnoozed},` +
            ` snoozeUntil=${thread.snoozeUntil?.toISOString() ?? "null"})` +
            ` by email id=${triggerEmail.id} from="${triggerEmail.from}"` +
            ` messageId=${triggerEmail.messageId}` +
            ` sentByAutoResponder=${triggerEmail.sentByAutoResponder}`,
        );
      } else {
        this.logger.warn(
          `[DEBUG #2125] cancelThreadSnoozeIfNeeded triggered for thread ${thread.id}` +
            ` (isSnoozed=${thread.isSnoozed},` +
            ` snoozeUntil=${thread.snoozeUntil?.toISOString() ?? "null"}) - no trigger email provided`,
        );
      }

      if (thread.isSnoozed) {
        await this.emailThreadRepository.update(
          { id: thread.id },
          { isSnoozed: false, snoozeUntil: null },
        );
        this.logger.log(
          `Cancelled thread-level snooze for thread ${thread.id} due to new reply`,
        );
      }
      if (snoozedEmailsInThread.length > 0) {
        await this.emailRepository.update(
          { emailThreadId: thread.id, userId, isSnoozed: true },
          { isSnoozed: false, snoozeUntil: null },
        );
        this.logger.log(
          `Cancelled snooze for ${snoozedEmailsInThread.length} email(s) in thread ${thread.id}`,
        );
      }

      const firstSnoozedEmail = snoozedEmailsInThread[0];
      if (firstSnoozedEmail?.threadId) {
        try {
          const provider =
            await this.emailProviderManager.getPrimaryProvider(userId);
          if (provider) {
            await provider.unsnoozeThread(userId, firstSnoozedEmail.threadId);
            this.logger.log(
              `Successfully synced unsnooze to provider for thread ${firstSnoozedEmail.threadId}`,
            );
          }
        } catch (providerError) {
          this.logger.error(
            `Failed to sync unsnooze to email provider for thread ${firstSnoozedEmail.threadId}:`,
            providerError,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cancel snooze for thread ${thread.id}:`,
        error,
      );
    }
  }

  async invalidateSuggestedActionsCache(threadId: string): Promise<void> {
    try {
      await this.actionItemRepository.delete({
        emailThreadId: threadId,
        source: "llm",
        actionType: Not(IsNull()),
      });
      this.logger.debug(
        `Invalidated LLM suggested actions cache for thread ${threadId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate suggested actions cache for thread ${threadId}:`,
        error,
      );
    }
  }

  private logLabelsSaved(savedEmail: Email): void {
    this.logger.debug(
      `[EmailLifecycleService] Email ${savedEmail.id} saved ${savedEmail.labels ? `with labels: ${JSON.stringify(savedEmail.labels)}` : "with no labels"}`,
    );
  }

  async queuePostSaveJobs(
    userId: string,
    savedEmail: Email,
    thread: EmailThread,
    queueBatchPriorityRefinement?: (
      userId: string,
      emailId: string,
    ) => Promise<void>,
  ): Promise<void> {
    if (queueBatchPriorityRefinement) {
      await queueBatchPriorityRefinement(userId, savedEmail.id).catch(
        async (err) => {
          this.logger.error(
            `Failed to queue priority refinement for email ${savedEmail.id}:`,
            err,
          );
          // Priority refinement is what later decides (and clears) the summary
          // state, so if it never queues we must clear both processing flags
          // here to avoid a permanently pending UI.
          await this.clearProcessingFlags(thread, savedEmail.id);
        },
      );
    } else {
      // Without a priority-refinement callback nothing will ever clear the
      // processing flags (priority refinement is what later decides and clears
      // the summary state), so clear both here to avoid a permanently pending UI.
      await this.clearProcessingFlags(thread, savedEmail.id);
    }

    // The background summary is deliberately NOT enqueued here. It is gated on
    // the thread's priorityScore, which isn't known until priority refinement
    // (queued above) completes. The priority-completion paths call
    // BackgroundSummaryQueueService.maybeQueueBackgroundSummary, which either
    // enqueues the summary (score above threshold) or clears isProcessingSummary
    // so the email summarises on demand when opened.

    if (savedEmail.emailThreadId)
      this.queueThreadLevelJobs(userId, savedEmail, thread);

    if (thread && thread.starCount > 0 && this.suggestedRepliesService) {
      this.suggestedRepliesService
        .queueSuggestedReplyGeneration(userId, thread.id, savedEmail.id)
        .catch((err) =>
          this.logger.error(
            `Failed to queue suggested reply regeneration for thread ${thread.id}:`,
            err,
          ),
        );
    }
  }

  private async clearProcessingFlags(
    thread: EmailThread | null | undefined,
    emailId: string,
  ): Promise<void> {
    if (thread) {
      thread.isProcessingPriority = false;
      await this.emailThreadRepository.save(thread);
    }
    await this.emailRepository.update(
      { id: emailId },
      { isProcessingSummary: false },
    );
  }

  private queueThreadLevelJobs(
    userId: string,
    savedEmail: Email,
    thread?: EmailThread,
  ): void {
    // A new email landing in a thread that already has fetched GitHub statuses
    // may have changed them (e.g. a "QA Status: FAIL" comment reopening an
    // issue), so the cached status is now stale. Force a re-fetch that bypasses
    // both the per-hour singleton window and the cache-freshness gate; otherwise
    // the badge keeps showing the old status until the user manually hits Sync.
    const forceGithubRefresh = (thread?.githubMetadata?.links ?? []).some(
      (link) => Boolean(link.fetchedAt),
    );
    this.boss
      .send(
        JOB_NAMES.FETCH_GITHUB_METADATA,
        {
          userId,
          emailId: savedEmail.id,
          threadId: savedEmail.emailThreadId,
          forceRefresh: forceGithubRefresh,
        },
        {
          priority: getJobPriority(
            JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
            false,
          ),
          // Retry transient failures (GitHub rate limits, KMS hiccups) instead of
          // letting the singleton lock keep the badge invisible for a full hour.
          retryLimit: 3,
          retryDelay: 30,
          // The key still debounces against an in-flight job for the same thread.
          // For a forced refresh we drop the hour-long singleton window so the
          // new email actually triggers a re-check rather than being swallowed.
          singletonKey: `github-metadata-${savedEmail.emailThreadId}`,
          ...(forceGithubRefresh ? {} : { singletonSeconds: SECONDS.HOUR }),
        },
      )
      .catch((err) =>
        this.logger.error(
          `Failed to queue GitHub metadata job for email ${savedEmail.id}:`,
          err,
        ),
      );

    this.boss
      .send(
        JOB_NAMES.AUTO_RESPONDER,
        { userId, emailThreadId: savedEmail.emailThreadId },
        {
          priority: getJobPriority(JOB_NAMES.AUTO_RESPONDER),
          retryLimit: 2,
          retryDelay: 30,
          expireInSeconds: SECONDS.HOUR,
          singletonKey: `auto-responder-${savedEmail.emailThreadId}`,
        },
      )
      .then((jobId) => {
        if (jobId)
          this.logger.debug(
            `Queued auto-responder job ${jobId} for thread ${savedEmail.emailThreadId}`,
          );
      })
      .catch((err) =>
        this.logger.error(
          `Failed to queue auto-responder job for email ${savedEmail.id}:`,
          err,
        ),
      );

    // Queue workflow evaluation (#1483) — delayed 60s to allow summary/priority to complete
    this.boss
      .send(
        JOB_NAMES.EVALUATE_WORKFLOWS,
        { userId, emailThreadId: savedEmail.emailThreadId },
        {
          priority: getJobPriority(JOB_NAMES.EVALUATE_WORKFLOWS),
          retryLimit: 3,
          retryDelay: 30,
          expireInSeconds: SECONDS.HOUR,
          startAfter: 60,
          singletonKey: `workflow-eval-${savedEmail.emailThreadId}`,
        },
      )
      .then((jobId) => {
        if (jobId)
          this.logger.debug(
            `Queued evaluate-workflows job ${jobId} for thread ${savedEmail.emailThreadId}`,
          );
      })
      .catch((err) =>
        this.logger.error(
          `Failed to queue evaluate-workflows job for email ${savedEmail.id}:`,
          err,
        ),
      );
  }

  async saveBlockedEmail(options: {
    userId: string;
    email: Email;
    thread: EmailThread;
    isSenderBlocked: boolean;
    senderEmail: string;
    subject: string;
  }): Promise<Email> {
    const { userId, email, thread, isSenderBlocked, senderEmail, subject } =
      options;
    const blockReason = isSenderBlocked
      ? `blocked sender ${senderEmail}`
      : `blocked keyword in subject "${subject}"`;
    this.logger.log(
      `📛 Email from ${blockReason} - auto-archiving and skipping LLM processing`,
    );
    thread.isProcessingPriority = false;
    thread.hasBlockedLabel = true;
    this.recordImmediateDeliveryReason(
      thread,
      email,
      `Not batched — ${blockReason} (auto-archived)`,
      "blocked",
    );
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = false;
    email.summary = isSenderBlocked ? "[Blocked sender]" : "[Blocked keyword]";
    email.labels = [...(email.labels || []), "BearlyMail-Blocked"];

    const savedEmail = await this.emailRepository.save(email);
    this.boss
      .send(
        JOB_NAMES.ARCHIVE_EMAIL,
        { userId, emailId: savedEmail.id, isBlocked: true },
        {
          priority: getJobPriority(JOB_NAMES.ARCHIVE_EMAIL, false),
          singletonKey: `archive-blocked-${savedEmail.threadId}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      )
      .then((jobId) => {
        if (jobId)
          this.logger.log(
            `📛 Queued archive job ${jobId} for blocked sender email: threadId=${savedEmail.threadId}`,
          );
      })
      .catch((err) =>
        this.logger.error(
          `Failed to queue archive job for blocked sender email ${savedEmail.id}:`,
          err,
        ),
      );

    return savedEmail;
  }

  checkIfUrgent(email: Partial<Email>): boolean {
    const urgentKeywords = [
      "urgent",
      "asap",
      "critical",
      "emergency",
      "immediate",
      "time-sensitive",
    ];
    const normalizeWord = (word: string) => word.replace(/[^a-z0-9]/g, "");
    const subjectLower = (email.subject || "").toLowerCase();
    const subjectWords = subjectLower.split(/\s+/).map(normalizeWord);
    return urgentKeywords.some((keyword) =>
      subjectWords.includes(normalizeWord(keyword)),
    );
  }

  /**
   * Delegates to {@link PriorityBatchSchedulerService}, which owns the
   * debounce buffer and drains it to PgBoss on shutdown.
   */
  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    return this.priorityBatchScheduler.queueBatchPriorityRefinement(
      userId,
      emailId,
    );
  }
}
