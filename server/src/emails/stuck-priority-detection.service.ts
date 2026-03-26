import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Equal, IsNull, LessThan, Not, Or, Repository } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import { MAX_PRIORITY_RETRIES } from "../constants/priority-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";

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

  /** Maximum threads to re-queue per run to avoid flooding the job queue. */
  private static readonly MAX_REQUEUE_PER_RUN = 50;

  /** Cron schedule: every 15 minutes. */
  private static readonly DETECTION_CRON = "*/15 * * * *";

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      "Registering stuck-priority detection job (runs every 15 minutes)",
    );

    await this.boss.schedule(
      JOB_NAMES.DETECT_STUCK_PRIORITIES,
      StuckPriorityDetectionService.DETECTION_CRON,
    );

    await this.boss.work(JOB_NAMES.DETECT_STUCK_PRIORITIES, async () => {
      await this.detectAndRequeueStalePriorityThreads();
    });

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

    const [stuckThreads, stuckWithEmptyBreakdown] = await Promise.all([
      this.findStuckThreadsWithNullExplanation(cutoff),
      this.findStuckThreadsWithEmptyBreakdown(cutoff),
    ]);

    // Merge and deduplicate by thread id
    const seen = new Set<string>();
    const allStuck: EmailThread[] = [];
    for (const thread of [...stuckThreads, ...stuckWithEmptyBreakdown]) {
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
        select: [
          "id",
          "userId",
          "threadId",
          "priorityRetryCount",
          "priorityExplanation",
          "createdAt",
        ],
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
      const candidates = await this.emailThreadRepository.find({
        where: {
          // Not currently being processed
          isProcessingPriority: false,
          // Score is either null or 0 (no valid priority assigned)
          priorityScore: Or(IsNull(), Equal(0)),
          // priorityExplanation must exist (null case handled by findStuckThreadsWithNullExplanation)
          priorityExplanation: Not(IsNull()),
          // Old enough to have had initial processing time
          createdAt: LessThan(cutoff),
        },
        select: [
          "id",
          "userId",
          "threadId",
          "priorityRetryCount",
          "priorityExplanation",
          "createdAt",
        ],
        // fetch extra to account for post-filter reduction
        take: StuckPriorityDetectionService.MAX_REQUEUE_PER_RUN * 2,
        // oldest first
        order: { createdAt: "ASC" },
      });

      // Filter in application code after decryption by the column transformer
      return candidates.filter((thread) => {
        const breakdown = thread.priorityExplanation?.breakdown;
        return !breakdown || breakdown.length === 0;
      });
    } catch (err) {
      this.logger.warn(
        "Could not query for threads with empty breakdown — skipping",
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
      select: ["id"],
      order: { receivedAt: "DESC" },
    });

    if (!email) {
      this.logger.warn(
        `No email found for stuck thread ${thread.id} — skipping`,
      );
      return;
    }

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
