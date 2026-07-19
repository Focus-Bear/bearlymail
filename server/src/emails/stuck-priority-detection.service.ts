import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Equal, In, IsNull, LessThan, Not, Or, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MAX_PRIORITY_RETRIES } from "../constants/priority-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";

/**
 * Periodic safety-net service that detects email threads stuck at priority=0
 * with no breakdown (a symptom of a failed batch prioritisation run) and
 * re-queues them for individual priority calculation.
 *
 * Rationale: the priority refinement pipeline (`refine-priority-batch`) has no
 * built-in retry when LLM batch calls fail.  Emails that receive a fallback
 * result stay at score=0 forever unless explicitly re-triggered.  This service
 * acts as the safety net — complementing the inline retry in
 * LLMPriorityBatchService.requeueFallbackEmails() — to catch any threads that
 * slipped through.
 *
 * Runs every 15 minutes via PgBoss schedule (fix for issue #1454).
 */
@Injectable()
export class StuckPriorityDetectionService implements OnModuleInit {
  private readonly logger = new Logger(StuckPriorityDetectionService.name);

  /** Threads younger than this are skipped (give initial processing time). */
  private static readonly MIN_THREAD_AGE_MINUTES = 5;

  /**
   * A thread whose `isProcessingPriority` flag has stayed true for longer than
   * this almost certainly had its priority job die mid-flight (the badge shows
   * "Calculating…" forever). A normal refine-priority completes in seconds.
   */
  private static readonly PROCESSING_STUCK_MINUTES = 10;

  /** Maximum threads to re-queue per run to avoid flooding the job queue. */
  private static readonly MAX_REQUEUE_PER_RUN = 50;

  /** Cron schedule: every 15 minutes. */
  private static readonly DETECTION_CRON = "*/15 * * * *";

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      "Registering stuck-priority detection job (runs every 15 minutes)",
    );

    await this.boss.schedule(
      JOB_NAMES.DETECT_STUCK_PRIORITIES,
      StuckPriorityDetectionService.DETECTION_CRON,
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.DETECT_STUCK_PRIORITIES,
      async () => {
        await this.detectAndRequeueStalePriorityThreads();
      },
    );

    this.logger.log("Stuck-priority detection job registered successfully");
  }

  /**
   * Find threads with priorityScore=0/null, no breakdown, not currently processing,
   * old enough to have completed initial processing, and under the retry limit.
   * Re-queue a refine-priority job for each.
   */
  async detectAndRequeueStalePriorityThreads(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        StuckPriorityDetectionService.MIN_THREAD_AGE_MINUTES *
          MILLISECONDS.MINUTE,
    );
    const processingCutoff = new Date(
      Date.now() -
        StuckPriorityDetectionService.PROCESSING_STUCK_MINUTES *
          MILLISECONDS.MINUTE,
    );

    const [stuckThreads, stuckWithEmptyBreakdown, stuckProcessing] =
      await Promise.all([
        this.findStuckThreadsWithNullExplanation(cutoff),
        this.findStuckThreadsWithEmptyBreakdown(cutoff),
        this.findThreadsStuckProcessing(processingCutoff),
      ]);

    // Merge and deduplicate by thread id
    const seen = new Set<string>();
    const allStuck: EmailThread[] = [];
    for (const thread of [
      ...stuckThreads,
      ...stuckWithEmptyBreakdown,
      ...stuckProcessing,
    ]) {
      if (!seen.has(thread.id)) {
        seen.add(thread.id);
        allStuck.push(thread);
      }
    }

    // Filter out threads that have exceeded the retry limit
    const eligible = allStuck.filter(
      (thread) => (thread.priorityRetryCount ?? 0) < MAX_PRIORITY_RETRIES,
    );

    const toRequeue = eligible.slice(
      0,
      StuckPriorityDetectionService.MAX_REQUEUE_PER_RUN,
    );

    if (toRequeue.length === 0) {
      this.logger.debug("No stuck-priority threads found");
      return;
    }

    this.logger.warn(
      `Found ${allStuck.length} stuck-priority thread(s) (${allStuck.length - eligible.length} at max retries). Re-queuing ${toRequeue.length}.`,
    );

    let queued = 0;
    for (const thread of toRequeue) {
      try {
        await this.requeueThread(thread);
        queued++;
      } catch (err) {
        this.logger.error(
          `Failed to re-queue priority for thread ${thread.id}:`,
          err,
        );
      }
    }

    this.logger.log(
      `Stuck-priority detection complete: ${queued}/${toRequeue.length} threads re-queued`,
    );
  }

  /**
   * Find threads where priorityScore is 0 or NULL and priorityExplanation is NULL
   * (never written — also stuck).
   */
  private async findStuckThreadsWithNullExplanation(
    cutoff: Date,
  ): Promise<EmailThread[]> {
    try {
      return await this.emailThreadRepository.find({
        where: {
          // Not currently being processed
          isProcessingPriority: false,
          // Score is either null or 0 (no valid priority assigned)
          priorityScore: Or(IsNull(), Equal(0)),
          // priorityExplanation null means never written — also stuck
          priorityExplanation: IsNull(),
          // Old enough to have had initial processing time
          createdAt: LessThan(cutoff),
        },
        select: {
          id: true,
          userId: true,
          threadId: true,
          priorityRetryCount: true,
          priorityExplanation: true,
          createdAt: true,
        },
        // fetch extra to account for post-filter deduplication
        take: StuckPriorityDetectionService.MAX_REQUEUE_PER_RUN * 2,
        // oldest first
        order: { createdAt: "ASC" },
      });
    } catch (err) {
      this.logger.error("Failed to query for stuck-priority threads", err);
      return [];
    }
  }

  /**
   * Find threads where priorityExplanation exists but its breakdown array is empty
   * (a symptom of a failed/partial batch run).
   *
   * NOTE: priorityExplanation uses encryptedJsonTransformer — the stored value in
   * PostgreSQL is AES ciphertext, not raw JSON. Any attempt to cast it with ::jsonb
   * at the database level will always fail. Instead, we use TypeORM .find() to load
   * candidates (which triggers the column transformer to decrypt on read), then filter
   * the breakdown array in application code.
   */
  private async findStuckThreadsWithEmptyBreakdown(
    cutoff: Date,
  ): Promise<EmailThread[]> {
    try {
      // Step 1 — cross-user candidate scan, SCALAR columns only. We must NOT
      // select priorityExplanation here: it's per-user encrypted, and decrypting
      // it in this cross-user context (no per-user KMS key) fails for every row.
      const candidates = await this.emailThreadRepository.find({
        where: {
          isProcessingPriority: false,
          priorityScore: Or(IsNull(), Equal(0)),
          // priorityExplanation must exist (null case handled by findStuckThreadsWithNullExplanation)
          priorityExplanation: Not(IsNull()),
          createdAt: LessThan(cutoff),
        },
        select: {
          id: true,
          userId: true,
          threadId: true,
          priorityRetryCount: true,
          createdAt: true,
        },
        take: StuckPriorityDetectionService.MAX_REQUEUE_PER_RUN * 2,
        order: { createdAt: "ASC" },
      });

      // Step 2 — group by user so we can reload + decrypt priorityExplanation
      // under each user's KMS key.
      const byUser = new Map<string, string[]>();
      for (const candidate of candidates) {
        const ids = byUser.get(candidate.userId) ?? [];
        ids.push(candidate.id);
        byUser.set(candidate.userId, ids);
      }

      // Step 3 — per user, reload with priorityExplanation inside withUserKey
      // (so the transformer can decrypt it) and keep only genuinely-empty
      // breakdowns. Inspecting the breakdown is the whole point of this check,
      // so it legitimately needs the decrypted value — hence per-user iteration.
      const stuck: EmailThread[] = [];
      for (const [userId, ids] of byUser) {
        // Per-user try/catch: a single user's KMS key failure (misconfigured/
        // disabled key, transient KMS error) must not block the safety net for
        // everyone else.
        try {
          const withExplanation = await this.userEncryptionService.withUserKey(
            userId,
            () =>
              this.emailThreadRepository.find({
                where: { id: In(ids) },
                select: {
                  id: true,
                  userId: true,
                  threadId: true,
                  priorityRetryCount: true,
                  createdAt: true,
                  priorityExplanation: true,
                },
              }),
          );
          for (const thread of withExplanation) {
            const breakdown = thread.priorityExplanation?.breakdown;
            if (!breakdown || breakdown.length === 0) stuck.push(thread);
          }
        } catch (err) {
          this.logger.error(
            `Failed to load/decrypt priorityExplanation for user ${userId} — skipping`,
            err,
          );
        }
      }
      return stuck;
    } catch (err) {
      this.logger.warn(
        "Could not query for threads with empty breakdown — skipping",
        err,
      );
      return [];
    }
  }

  /**
   * Find threads still flagged `isProcessingPriority=true` long after their
   * priority job should have finished — the "Calculating…" badge that never
   * clears because the job died mid-flight. The inline 10%-on-inbox-load fixer
   * (`fixStuckCalculatingThreads`) catches these only opportunistically; this
   * makes the recovery reliable on the 15-minute schedule.
   */
  private async findThreadsStuckProcessing(
    cutoff: Date,
  ): Promise<EmailThread[]> {
    try {
      return await this.emailThreadRepository.find({
        where: {
          isProcessingPriority: true,
          updatedAt: LessThan(cutoff),
        },
        select: {
          id: true,
          userId: true,
          threadId: true,
          priorityRetryCount: true,
          createdAt: true,
        },
        take: StuckPriorityDetectionService.MAX_REQUEUE_PER_RUN * 2,
        order: { updatedAt: "ASC" },
      });
    } catch (err) {
      this.logger.error(
        "Failed to query for threads stuck processing priority",
        err,
      );
      return [];
    }
  }

  /**
   * Find an email for the given thread, enqueue a refine-priority job,
   * then increment the thread's retry count (only after successful enqueue).
   */
  private async requeueThread(thread: EmailThread): Promise<void> {
    // Get an email from this thread to use for the refine-priority job
    const email = await this.emailRepository.findOne({
      where: { emailThreadId: thread.id, userId: thread.userId },
      select: {
        id: true,
      },
      order: { receivedAt: "DESC" },
    });

    if (!email) {
      this.logger.warn(
        `No email found for stuck thread ${thread.id} — skipping`,
      );
      return;
    }

    // Clear any stuck "Calculating…" flag so the badge resolves and the
    // re-queued job starts from a clean state. No-op for the score=0 threads
    // (already false); essential for the isProcessingPriority=true case. If the
    // enqueue below fails, the thread is left with score 0 + flag false and is
    // re-detected next run.
    await this.emailThreadRepository.update(
      { id: thread.id },
      { isProcessingPriority: false },
    );

    // Send job first; only increment retry count after successful enqueue
    await this.boss.send(
      JOB_NAMES.REFINE_PRIORITY,
      {
        userId: thread.userId,
        emailId: email.id,
        isRetry: true,
        source: "stuck-priority-detection",
      },
      {
        priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BACKGROUND, false),
        singletonKey: `stuck-priority-retry-${email.id}`,
      },
    );

    // Increment retry count only after successful boss.send()
    await this.emailThreadRepository.increment(
      { id: thread.id },
      "priorityRetryCount",
      1,
    );

    this.logger.log(
      `Queued priority retry for thread ${thread.id} (user ${thread.userId}, email ${email.id})`,
    );
  }
}
