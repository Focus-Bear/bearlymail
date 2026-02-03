import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, In } from "typeorm";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { QUERY_LIMITS } from "../constants/query-limits";
import { isError, isDatabaseError } from "../types/common";

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
    // CRITICAL: Use query builder with explicit select to avoid decrypting body/htmlBody
    // These are large encrypted fields that cause significant slowdown
    // The frontend can fetch body/htmlBody separately if needed for individual emails
    const queryBuilder = this.emailRepository
      .createQueryBuilder("email")
      .select([
        "email.id",
        "email.userId",
        "email.threadId",
        "email.messageId",
        "email.from",
        "email.fromName",
        "email.senderJobTitle",
        "email.subject",
        "email.isSnoozed",
        "email.snoozeUntil",
        "email.isBatched",
        "email.batchReleaseAt",
        "email.isRead",
        "email.summary",
        "email.receivedAt",
        "email.labels", // Include labels field
        // Only include body/htmlBody if explicitly needed - they're large and encrypted
        // For thread view, we can fetch them separately for expanded emails
        "email.body",
        "email.htmlBody",
      ])
      .where("email.userId = :userId", { userId })
      .andWhere("email.threadId = :threadId", { threadId });

    // Apply ordering (default to ASC for chronological processing, DESC for thread view display)
    const order = options?.order || "ASC";
    queryBuilder.orderBy("email.receivedAt", order);

    // Apply limit if specified
    if (options?.limit) {
      queryBuilder.take(options.limit);
    }

    // TypeORM will automatically decrypt labels field due to the transformer
    return queryBuilder.getMany();
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in Gmail)
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = 7,
  ): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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
      .map((r: { threadId: string }) => r.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get all non-archived thread IDs for a user
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    const threads = await this.emailThreadRepository.find({
      where: { userId, isArchived: false },
      select: ["threadId"],
    });
    return threads.map((t) => t.threadId);
  }

  /**
   * Get non-archived threads that need status verification
   * Prioritizes threads that haven't been checked recently (oldest lastCheckedAt first)
   * Limits to a reasonable number per user per run to spread work across sync cycles
   */
  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = 50,
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
      .map((r: { threadId: string }) => r.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by Gmail sync to compare with Gmail search results
   */
  async getAllThreadsForSync(
    userId: string,
  ): Promise<
    Array<{ threadId: string; isArchived: boolean; starCount: number }>
  > {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select(["thread.threadId", "thread.isArchived", "thread.starCount"])
      .where("thread.userId = :userId", { userId })
      .limit(500)
      // Reasonable limit for sync
      .getMany();

    return results
      .map((t) => ({
        threadId: t.threadId,
        isArchived: t.isArchived,
        starCount: t.starCount,
      }))
      .filter((t) => t.threadId);
    // Filter out any null/undefined threadIds
  }

  /**
   * Update archived status for a single thread
   */
  async updateThreadArchivedStatus(
    userId: string,
    threadId: string,
    isArchived: boolean,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (thread) {
      // Only update if status changed to avoid unnecessary DB writes
      if (thread.isArchived !== isArchived) {
        thread.isArchived = isArchived;
        await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... archived status to ${isArchived}`,
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
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    const now = new Date();
    // Group by status for more efficient updates
    const archivedThreadIds = updates
      .filter((update) => update.isArchived)
      .map((update) => update.threadId);
    const unarchivedThreadIds = updates
      .filter((update) => !update.isArchived)
      .map((update) => update.threadId);

    // Batch update archived threads
    if (archivedThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(archivedThreadIds) },
        { isArchived: true, lastCheckedAt: now },
      );
    }

    // Batch update unarchived threads
    if (unarchivedThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(unarchivedThreadIds) },
        { isArchived: false, lastCheckedAt: now },
      );
    }

    this.logger.debug(
      `Batch updated ${updates.length} thread archived statuses`,
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
      select: ["threadId", "starCount"],
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
    if (perThreadTime > 200) {
      this.logger.warn(
        `batchUpdateThreadStarCount took ${duration}ms for ${filteredUpdates.length} threads (${perThreadTime.toFixed(1)}ms/thread, budget: 200ms)`,
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
      select: ["threadId", "updatedAt", "starCount", "isArchived"],
    });
    return threads.map((t) => ({
      threadId: t.threadId,
      updatedAt: t.updatedAt,
      starCount: t.starCount,
      isArchived: t.isArchived,
    }));
  }

  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    const threads = await this.emailThreadRepository.find({
      where: { userId, starCount: MoreThan(0) },
      select: ["threadId", "starCount", "isArchived"],
    });
    return threads.map((t) => ({
      threadId: t.threadId,
      starCount: t.starCount,
      isArchived: t.isArchived,
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
          .execute();
      }
    });
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   * Handles race conditions by catching duplicate key errors
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
      const needsUpdate =
        thread.starCount !== starCount || thread.isArchived !== isArchived;
      if (needsUpdate) {
        thread.starCount = starCount;
        thread.isArchived = isArchived;
        thread = await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated EmailThread for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... (starCount=${starCount}, isArchived=${isArchived})`,
        );
      }
    }

    return thread;
  }
}
