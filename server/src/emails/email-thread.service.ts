import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindManyOptions, In, MoreThan, Repository } from "typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS_PER_WEEK, MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { isDatabaseError, isError } from "../types/common";

const PER_THREAD_BUDGET_MS = 200;

/**
 * Service for managing email threads
 * Extracted from EmailsService to keep files focused and maintainable
 */
@Injectable()
export class EmailThreadService {
  private readonly logger = new Logger(EmailThreadService.name);

  constructor(
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
  ) {}

  /**
   * Get all emails in a thread, sorted by date
   */
  async getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]> {
    // Use repository.find (same hydration path as getEmailById) so column transformers
    // reliably decrypt. Partial QueryBuilder selects were leaking ciphertext to the client.
    const order = options?.order || "ASC";
    const findOptions: FindManyOptions<Email> = {
      where: { userId, threadId },
      order: { receivedAt: order },
    };
    if (options?.limit) {
      findOptions.take = options.limit;
    }

    const emails = await this.emailRepository.find(findOptions);
    for (const email of emails) {
      decryptEmailEntityForApi(email);
    }
    return emails;
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in Gmail)
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS_PER_WEEK,
  ): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - days * MILLISECONDS.DAY);
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      .innerJoin("emails", "email", "email.emailThreadId = thread.id")
      .andWhere("email.receivedAt >= :cutoffDate", { cutoffDate })
      .limit(QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE)
      // Limit to avoid rate limits
      .getRawMany();

    // Filter out any null/undefined
    return results
      .map((result: { threadId: string }) => result.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get all non-archived thread IDs for a user
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    const threads = await this.emailThreadRepository.find({
      where: { userId, isArchived: false },
      select: {
        threadId: true,
      },
    });
    return threads.map((thread) => thread.threadId);
  }

  /**
   * Get non-archived threads that need status verification
   * Prioritizes threads that haven't been checked recently (oldest lastCheckedAt first)
   * Limits to a reasonable number per user per run to spread work across sync cycles
   */
  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = QUERY_LIMITS.INBOX_PAGE_SIZE,
  ): Promise<string[]> {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      .orderBy("thread.lastCheckedAt", "ASC", "NULLS FIRST")
      // Prioritize threads that haven't been checked or were checked longest ago
      .limit(limit)
      .getRawMany();

    // Filter out any null/undefined
    return results
      .map((result: { threadId: string }) => result.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by Gmail sync to compare with Gmail search results
   */
  async getAllThreadsForSync(userId: string): Promise<
    Array<{
      threadId: string;
      isArchived: boolean;
      starCount: number;
      syncStatus: "synced" | "unsynced";
    }>
  > {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select([
        "thread.threadId",
        "thread.isArchived",
        "thread.starCount",
        "thread.syncStatus",
      ])
      .where("thread.userId = :userId", { userId })
      .limit(QUERY_LIMITS.INBOX_TOTAL)
      // Reasonable limit for sync
      .getMany();

    return results
      .map((thread) => ({
        threadId: thread.threadId,
        isArchived: thread.isArchived,
        starCount: thread.starCount,
        syncStatus: thread.syncStatus,
      }))
      .filter((thread) => thread.threadId);
    // Filter out any null/undefined threadIds
  }

  /**
   * Update archived status for a single thread
   * @param setLastUserOperation - If true, sets lastUserOperationAt to now (for user-initiated actions)
   */
  async updateThreadArchivedStatus(
    userId: string,
    threadId: string,
    isArchived: boolean,
    setLastUserOperation: boolean = false,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (thread) {
      // Only update if status changed to avoid unnecessary DB writes
      const needsUpdate =
        thread.isArchived !== isArchived || setLastUserOperation;
      if (needsUpdate) {
        thread.isArchived = isArchived;
        if (setLastUserOperation) {
          thread.lastUserOperationAt = new Date();
          thread.syncStatus = "unsynced";
          thread.syncStatusUpdatedAt = new Date();
        }
        await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... archived status to ${isArchived}${setLastUserOperation ? " (user operation)" : ""}`,
        );
      }
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, 0, isArchived);
    }
  }

  /**
   * Update lastCheckedAt for multiple threads (used to track verification without status changes)
   */
  async updateThreadsLastCheckedAt(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    if (threadIds.length === 0) return;

    const now = new Date();
    await this.emailThreadRepository
      .createQueryBuilder()
      .update()
      .set({ lastCheckedAt: now })
      .where("userId = :userId", { userId })
      .andWhere("threadId IN (:...threadIds)", { threadIds })
      .execute();
  }

  /**
   * Batch update thread archived statuses (more efficient than individual updates)
   * IMPORTANT: This method respects lastUserOperationAt - it will NOT override
   * a user's recent archive/unarchive action unless there's a new email in the thread.
   * This is called by sync processes, not by user actions.
   *
   * Additionally, threads that were recently auto-responded to (lastAutoRespondedAt within 24h)
   * are excluded from sync-triggered archiving. When BearlyMail sends an auto-reply, Gmail
   * may remove the INBOX label from the thread, causing our sync to set isArchived=true —
   * which silently hides the thread from the user. The 24h guard prevents this data loss.
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    const now = new Date();
    // Cutoff: threads auto-responded to within the last 24 hours are protected from archiving
    const autoRespondedCutoff = new Date(now.getTime() - MILLISECONDS.DAY);

    const filteredUpdates = updates;

    // Group by status for more efficient updates
    const archivedThreadIds = filteredUpdates
      .filter((update) => update.isArchived)
      .map((update) => update.threadId);
    const unarchivedThreadIds = filteredUpdates
      .filter((update) => !update.isArchived)
      .map((update) => update.threadId);

    // Batch update archived threads (only those without recent user operations or recent auto-responses)
    if (archivedThreadIds.length > 0) {
      await this.emailThreadRepository
        .createQueryBuilder()
        .update()
        .set({ isArchived: true, lastCheckedAt: now })
        .where("userId = :userId", { userId })
        .andWhere("threadId IN (:...threadIds)", {
          threadIds: archivedThreadIds,
        })
        .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
        .andWhere(
          '("lastAutoRespondedAt" IS NULL OR "lastAutoRespondedAt" < :autoRespondedCutoff)',
          { autoRespondedCutoff },
        )
        .execute();
    }

    // Batch update unarchived threads (only those without recent user operations)
    if (unarchivedThreadIds.length > 0) {
      await this.emailThreadRepository
        .createQueryBuilder()
        .update()
        .set({ isArchived: false, lastCheckedAt: now })
        .where("userId = :userId", { userId })
        .andWhere("threadId IN (:...threadIds)", {
          threadIds: unarchivedThreadIds,
        })
        .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
        .execute();
    }

    this.logger.debug(
      `Batch updated ${filteredUpdates.length} thread archived statuses (${updates.length - filteredUpdates.length} skipped due to user operations)`,
    );
  }

  /**
   * Update star count for a thread (updates EmailThread)
   * For bulk updates, use batchUpdateThreadStarCount instead
   */
  async updateThreadStarCount(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (thread) {
      // Only update if starCount changed to avoid unnecessary DB writes
      const normalizedStarCount = Math.max(0, Math.min(3, starCount));
      if (thread.starCount !== normalizedStarCount) {
        thread.starCount = normalizedStarCount;
        await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... star count to ${normalizedStarCount}`,
        );
      }
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, starCount, false);
    }
  }

  /**
   * Bulk update star counts for multiple threads in a single query
   * Performance budget: 200ms per thread (but bulk update makes this much faster)
   */
  async batchUpdateThreadStarCount(
    userId: string,
    updates: { threadId: string; starCount: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const startTime = Date.now();

    // Query current starCount values to filter out unchanged updates
    const threadIds = updates.map((update) => update.threadId);
    const currentThreads = await this.emailThreadRepository.find({
      where: { userId, threadId: In(threadIds) },
      select: {
        threadId: true,
        starCount: true,
      },
    });

    const currentStarCounts = new Map<string, number>();
    for (const thread of currentThreads) {
      currentStarCounts.set(thread.threadId, thread.starCount);
    }

    // Filter out updates where starCount hasn't changed
    const filteredUpdates = updates.filter((update) => {
      const normalizedStarCount = Math.max(0, Math.min(3, update.starCount));
      const currentStarCount = currentStarCounts.get(update.threadId) ?? 0;
      return normalizedStarCount !== currentStarCount;
    });

    if (filteredUpdates.length === 0) {
      this.logger.debug(
        `batchUpdateThreadStarCount: All ${updates.length} threads already have correct starCount, skipping update`,
      );
      return;
    }

    // Use raw SQL for efficient bulk update
    // Group updates by starCount to minimize queries
    const updatesByStarCount = new Map<number, string[]>();
    for (const update of filteredUpdates) {
      const starCount = Math.max(0, Math.min(3, update.starCount));
      if (!updatesByStarCount.has(starCount)) {
        updatesByStarCount.set(starCount, []);
      }
      updatesByStarCount.get(starCount)!.push(update.threadId);
    }

    const now = new Date();
    // Execute bulk updates for each starCount value
    await this.emailThreadRepository.manager.transaction(async (manager) => {
      for (const [
        starCount,
        threadIdsToUpdate,
      ] of updatesByStarCount.entries()) {
        if (threadIdsToUpdate.length > 0) {
          await manager.query(
            `UPDATE email_threads 
             SET "starCount" = $1, "updatedAt" = CURRENT_TIMESTAMP, "lastCheckedAt" = $4
             WHERE "userId" = $2 AND "threadId" = ANY($3::text[])`,
            [starCount, userId, threadIdsToUpdate, now],
          );
        }
      }
    });

    const duration = Date.now() - startTime;
    const perThreadTime = duration / filteredUpdates.length;
    const skippedCount = updates.length - filteredUpdates.length;
    if (skippedCount > 0) {
      this.logger.debug(
        `batchUpdateThreadStarCount: Updated ${filteredUpdates.length} threads, skipped ${skippedCount} unchanged (${duration}ms)`,
      );
    }
    if (perThreadTime > PER_THREAD_BUDGET_MS) {
      this.logger.warn(
        `batchUpdateThreadStarCount took ${duration}ms for ${filteredUpdates.length} threads (${perThreadTime.toFixed(1)}ms/thread, budget: ${PER_THREAD_BUDGET_MS}ms)`,
      );
    } else {
      this.logger.debug(
        `batchUpdateThreadStarCount: ${filteredUpdates.length} threads in ${duration}ms (${perThreadTime.toFixed(1)}ms/thread)`,
      );
    }
  }

  /**
   * Get existing starred threads from database (for checking against Gmail)
   */
  /**
   * Get threads by thread IDs
   */
  async getThreadsByThreadIds(
    userId: string,
    threadIds: string[],
  ): Promise<
    Array<{
      threadId: string;
      updatedAt: Date;
      starCount: number;
      isArchived: boolean;
    }>
  > {
    if (threadIds.length === 0) return [];

    const threads = await this.emailThreadRepository.find({
      where: { userId, threadId: In(threadIds) },
      select: {
        threadId: true,
        updatedAt: true,
        starCount: true,
        isArchived: true,
      },
    });
    return threads.map((thread) => ({
      threadId: thread.threadId,
      updatedAt: thread.updatedAt,
      starCount: thread.starCount,
      isArchived: thread.isArchived,
    }));
  }

  /**
   * Distinct thread IDs whose emails were received in [after, before), most
   * recent first. Used by context analysis for providers (e.g. Apple Mail)
   * whose search can't run Gmail-style date-range queries — the emails are
   * already synced locally, so we discover threads from our own store.
   */
  async getThreadIdsByReceivedRange(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .select("email.threadId", "threadId")
      .addSelect("MAX(email.receivedAt)", "latest")
      .where("email.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :after", { after })
      .andWhere("email.receivedAt < :before", { before })
      .groupBy("email.threadId")
      .orderBy("latest", "DESC")
      .limit(limit)
      .getRawMany<{ threadId: string }>();
    return rows.map((row) => row.threadId).filter(Boolean);
  }

  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    const threads = await this.emailThreadRepository.find({
      where: { userId, starCount: MoreThan(0) },
      select: {
        threadId: true,
        starCount: true,
        isArchived: true,
      },
    });
    return threads.map((thread) => ({
      threadId: thread.threadId,
      starCount: thread.starCount,
      isArchived: thread.isArchived,
    }));
  }

  /**
   * Batch update thread statuses (archived + starred) in a single transaction
   * This is MUCH faster than individual updates for syncing many threads
   */
  async batchUpdateThreadStatus(
    userId: string,
    updates: { threadId: string; isArchived: boolean; starCount: number }[],
    deletedThreadIds: string[],
  ): Promise<void> {
    if (updates.length === 0 && deletedThreadIds.length === 0) return;

    // Use a transaction for atomic updates
    await this.emailThreadRepository.manager.transaction(async (manager) => {
      const threadRepo = manager.getRepository(
        this.emailThreadRepository.target,
      );

      // Batch update existing threads
      if (updates.length > 0) {
        // Group by archived status and star count to minimize queries
        const archivedUpdates = updates.filter((update) => update.isArchived);
        const starredUpdates = updates.filter((update) => update.starCount > 0);
        const unstarredUpdates = updates.filter(
          (update) => update.starCount === 0 && !update.isArchived,
        );

        // Update archived threads
        if (archivedUpdates.length > 0) {
          const archivedIds = archivedUpdates.map((update) => update.threadId);
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ isArchived: true })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", { threadIds: archivedIds })
            .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
            .execute();
        }

        // Update starred threads (starCount = 3)
        if (starredUpdates.length > 0) {
          const starredIds = starredUpdates.map((update) => update.threadId);
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 3 })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", { threadIds: starredIds })
            .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
            .execute();
        }

        // Update unstarred threads (starCount = 0)
        if (unstarredUpdates.length > 0) {
          const unstarredIds = unstarredUpdates.map(
            (update) => update.threadId,
          );
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 0 })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", {
              threadIds: unstarredIds,
            })
            .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
            .execute();
        }
      }

      // Mark deleted threads as archived
      if (deletedThreadIds.length > 0) {
        await threadRepo
          .createQueryBuilder()
          .update()
          .set({ isArchived: true })
          .where("userId = :userId", { userId })
          .andWhere("threadId IN (:...threadIds)", {
            threadIds: deletedThreadIds,
          })
          .andWhere('"syncStatus" = :syncStatus', { syncStatus: "synced" })
          .execute();
      }
    });
  }

  async markThreadSyncStatus(
    userId: string,
    threadId: string,
    syncStatus: "synced" | "unsynced",
  ): Promise<void> {
    await this.emailThreadRepository.update(
      { userId, threadId },
      { syncStatus, syncStatusUpdatedAt: new Date() },
    );
  }

  async markThreadsUnsynced(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    if (threadIds.length === 0) return;
    await this.emailThreadRepository.update(
      { userId, threadId: In(threadIds) },
      { syncStatus: "unsynced", syncStatusUpdatedAt: new Date() },
    );
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   * Handles race conditions by catching duplicate key errors
   * IMPORTANT: When a new email arrives in an existing thread, this clears
   * lastUserOperationAt so that sync can update the thread status again.
   */
  async getOrCreateEmailThread(
    userId: string,
    threadId: string,
    starCount: number = 0,
    isArchived: boolean = false,
  ): Promise<EmailThread> {
    // Try to find existing thread first
    let thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    const isExistingThread = !!thread;

    if (!thread) {
      // Thread doesn't exist, try to create it
      // Use a transaction to handle race conditions
      try {
        thread = this.emailThreadRepository.create({
          userId,
          threadId,
          starCount,
          isArchived,
        });
        thread = await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Created EmailThread for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... (starCount=${starCount}, isArchived=${isArchived})`,
        );
      } catch (error: unknown) {
        // Handle race condition: if another process created the thread between our check and save
        const isDbError = isDatabaseError(error) && error.code === "23505";
        const errorMessage = isError(error) ? error.message : undefined;
        if (
          isDbError ||
          errorMessage?.includes("duplicate key") ||
          errorMessage?.includes("unique constraint")
        ) {
          // Thread was created by another process, fetch it
          this.logger.debug(
            `Race condition detected for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}..., fetching existing thread`,
          );
          thread = await this.emailThreadRepository.findOne({
            where: { userId, threadId },
          });
          if (!thread) {
            // Still not found, this is unexpected
            throw new Error(
              `Failed to create or find thread ${threadId} after race condition`,
            );
          }
        } else {
          // Some other error, rethrow
          throw error;
        }
      }
    }

    // Update if values changed
    if (thread) {
      const shouldClearUserOperation =
        isExistingThread && thread.lastUserOperationAt !== null;

      // When a new email arrives in a user-protected thread:
      // ALWAYS preserve the existing BearlyMail starCount.
      //
      // Rationale:
      // - BearlyMail's starCount (0-3) is a BearlyMail-specific concept representing
      //   triage (0) vs action/follow-up priority levels (1-3).
      // - Email providers (Gmail, etc.) only have binary starred/not-starred.
      // - When someone replies to a thread, the new incoming message doesn't have the
      //   STARRED label, so Gmail sync determines starCount=0 from the latest message.
      // - This would incorrectly reset a follow-up thread (starCount=1) back to triage (0).
      // - By preserving the existing starCount, we ensure user's follow-up/action
      //   designation is maintained when new emails arrive.
      const effectiveStarCount = shouldClearUserOperation
        ? thread.starCount
        : starCount;

      const needsUpdate =
        thread.starCount !== effectiveStarCount ||
        thread.isArchived !== isArchived ||
        shouldClearUserOperation;

      if (needsUpdate) {
        thread.starCount = effectiveStarCount;
        thread.isArchived = isArchived;
        if (shouldClearUserOperation) {
          this.logger.debug(
            `Clearing lastUserOperationAt for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... - new email arrived (effectiveStarCount=${effectiveStarCount})`,
          );
          thread.lastUserOperationAt = null;
          thread.syncStatus = "synced";
          thread.syncStatusUpdatedAt = new Date();
        }
        thread = await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated EmailThread for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... (starCount=${effectiveStarCount}, isArchived=${isArchived})`,
        );
      }
    }

    return thread;
  }
}
