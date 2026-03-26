import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { IsNull, Not, Repository } from "typeorm";

import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BlockedKeywordsService } from "../blocked-keywords/blocked-keywords.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { MINUTES, MS_PER_SECOND } from "../constants/time-constants";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import { SuggestedRepliesService } from "../suggested-replies/suggested-replies.service";
import { UsersService } from "../users/users.service";
import { computeEmailHmac, computeRecipientsHmac } from "../utils/hmac-email";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailThreadService } from "./email-thread.service";
import { EmailDataWithOptionalThreadProps } from "./interfaces/email-data.interface";

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
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(forwardRef(() => SuggestedRepliesService))
    private suggestedRepliesService?: SuggestedRepliesService,
  ) {}

  async createEmail(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    options?: { skipBatching?: boolean },
    queueBatchPriorityRefinement?: (
      userId: string,
      emailId: string,
    ) => Promise<void>,
  ): Promise<Email> {
    this.logger.debug(
      `Creating email for user ${userId}: ${emailData.subject}`,
    );

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

    const deferredEmail = await this.maybeDeferInactiveUser(
      userId,
      thread,
      email,
    );
    if (deferredEmail) return deferredEmail;

    thread.isProcessingPriority = true;
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = true;

    const batchResult = await this.determineBatchDecision(
      userId,
      thread,
      starCount,
      thread.priorityScore || 0,
      options,
    );
    email.batchDecisionReason = batchResult.batchDecisionReason;

    const savedEmail = await this.emailRepository.save(email);
    this.logger.debug(
      `[EmailLifecycleService] Saved email ${savedEmail.id} to database`,
    );

    await this.updateThreadAfterSave(userId, thread, batchResult);
    this.logLabelsSaved(savedEmail);
    await this.queuePostSaveJobs(
      userId,
      savedEmail,
      thread,
      queueBatchPriorityRefinement,
    );

    return savedEmail;
  }

  private async maybeDeferInactiveUser(
    userId: string,
    thread: EmailThread,
    email: Email,
  ): Promise<Email | null> {
    const isActive = await this.usersService.isUserActive(userId);
    if (isActive) return null;
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
        select: ["id"],
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
    if (starCount > 0)
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Starred email",
      };

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

  async updateThreadAfterSave(
    userId: string,
    thread: EmailThread,
    batchDecision: {
      isBatched: boolean;
      batchReleaseAt: Date | null;
      wasDeliveredEarly: boolean;
      batchDecisionReason: string;
    },
  ): Promise<void> {
    const threadUpdate: Partial<EmailThread> = {
      updatedAt: new Date(),
      isBatched: batchDecision.isBatched,
      batchReleaseAt: batchDecision.batchReleaseAt,
      wasDeliveredEarly: batchDecision.wasDeliveredEarly,
      batchDecisionReason: batchDecision.batchDecisionReason,
    };
    await this.emailThreadRepository.update({ id: thread.id }, threadUpdate);
    await this.cancelThreadSnoozeIfNeeded(userId, thread);
    await this.invalidateSuggestedActionsCache(thread.id);
  }

  async cancelThreadSnoozeIfNeeded(
    userId: string,
    thread: EmailThread,
  ): Promise<void> {
    try {
      const snoozedEmailsInThread = await this.emailRepository.find({
        where: { emailThreadId: thread.id, userId, isSnoozed: true },
      });
      if (!thread.isSnoozed && snoozedEmailsInThread.length === 0) return;

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
    if (savedEmail.labels) {
      this.logger.debug(
        `[EmailLifecycleService] Email ${savedEmail.id} saved with labels (after TypeORM): ${JSON.stringify(savedEmail.labels)}`,
      );
    } else {
      this.logger.debug(
        `[EmailLifecycleService] Email ${savedEmail.id} saved with no labels`,
      );
    }
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
          if (thread) {
            thread.isProcessingPriority = false;
            await this.emailThreadRepository.save(thread);
          }
        },
      );
    }

    const summaryJobId = await this.boss
      .send(
        JOB_NAMES.GENERATE_SUMMARY,
        { userId, emailId: savedEmail.id, threadId: savedEmail.emailThreadId },
        {
          priority: getJobPriority(
            JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
            false,
          ),
          singletonKey: `generate-summary-thread-${savedEmail.emailThreadId || savedEmail.id}`,
          singletonMinutes: 5,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue summary generation for email ${savedEmail.id}:`,
          err,
        );
        this.emailRepository.update(
          { id: savedEmail.id },
          { isProcessingSummary: false },
        );
        return null;
      });

    if (summaryJobId)
      this.logger.debug(
        `Queued summary generation job ${summaryJobId} for email ${savedEmail.id}`,
      );

    if (savedEmail.emailThreadId) this.queueThreadLevelJobs(userId, savedEmail);

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

  private queueThreadLevelJobs(userId: string, savedEmail: Email): void {
    this.boss
      .send(
        JOB_NAMES.FETCH_GITHUB_METADATA,
        { userId, emailId: savedEmail.id, threadId: savedEmail.emailThreadId },
        {
          priority: getJobPriority(
            JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
            false,
          ),
          singletonKey: `github-metadata-${savedEmail.emailThreadId}`,
          singletonMinutes: MINUTES.HOUR,
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
          expireInMinutes: MINUTES.HOUR,
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
          expireInMinutes: MINUTES.HOUR,
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
          singletonMinutes: 5,
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

  // ── Priority batch buffer ─────────────────────────────────────────────────

  private readonly priorityBatchBuffer = new Map<
    string,
    { emailIds: string[]; timer: ReturnType<typeof setTimeout> | null }
  >();

  private readonly BATCH_FLUSH_DELAY_MS = 5 * MS_PER_SECOND;

  private readonly BATCH_MAX_SIZE = 10;

  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    let buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer) {
      buffer = { emailIds: [], timer: null };
      this.priorityBatchBuffer.set(userId, buffer);
    }
    buffer.emailIds.push(emailId);

    if (buffer.emailIds.length >= this.BATCH_MAX_SIZE) {
      await this.flushPriorityBatch(userId);
      return;
    }

    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = setTimeout(() => {
      this.flushPriorityBatch(userId).catch((err) =>
        this.logger.error(
          `Failed to flush priority batch for user ${userId}:`,
          err,
        ),
      );
    }, this.BATCH_FLUSH_DELAY_MS);
  }

  private async flushPriorityBatch(userId: string): Promise<void> {
    const buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer || buffer.emailIds.length === 0) return;
    const emailIds = [...buffer.emailIds];
    buffer.emailIds = [];
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    if (emailIds.length === 1) {
      await this.boss
        .send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: emailIds[0] },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-${emailIds[0]}`,
            singletonMinutes: 1,
          },
        )
        .catch((err) =>
          this.logger.error(
            `Failed to queue single priority refinement for email ${emailIds[0]}:`,
            err,
          ),
        );
      return;
    }

    const batchJobId = await this.boss
      .send(
        JOB_NAMES.REFINE_PRIORITY_BATCH,
        { userId, emailIds },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BATCH, false),
          singletonKey: `refine-priority-batch-${userId}-${Date.now()}`,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue batch priority refinement for ${emailIds.length} emails:`,
          err,
        );
        return null;
      });

    if (batchJobId)
      this.logger.log(
        `Queued batch priority refinement job ${batchJobId} for ${emailIds.length} emails (user: ${userId})`,
      );
  }
}
