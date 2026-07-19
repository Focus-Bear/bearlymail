import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { parseCategoryName } from "../utils/category-name.util";

/**
 * CategoryDedupService — startup repair for duplicate EMAIL_CATEGORY rows.
 *
 * Extracted from EmailsService (fix #1258) to keep emails.service.ts within
 * the 800-line limit. Migration 1786000000000 flags rows that need dedup.
 */
@Injectable()
export class CategoryDedupService {
  private readonly logger = new Logger(CategoryDedupService.name);

  constructor(
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
  ) {}

  /** Decrypt partial-select rows and group by userId for dedup processing. */
  private groupFlaggedContextsByUserId(
    flaggedContexts: UserContext[],
  ): Map<string, UserContext[]> {
    flaggedContexts.forEach(decryptUserContextEntityForApi);
    const byUser = new Map<string, UserContext[]>();
    for (const ctx of flaggedContexts) {
      const list = byUser.get(ctx.userId) ?? [];
      list.push(ctx);
      byUser.set(ctx.userId, list);
    }
    return byUser;
  }

  /**
   * Repair duplicate EMAIL_CATEGORY rows flagged by migration 1786000000000 (fix #1258).
   *
   * For each user with duplicate category names (same display name, different UUIDs),
   * this method:
   *   1. Decrypts all flagged EMAIL_CATEGORY rows per user
   *   2. Groups rows by normalised display name (first segment before " - ")
   *   3. Keeps the oldest UUID (earliest createdAt) as canonical
   *   4. Re-points any email_threads.categoryId values to the canonical UUID
   *   5. Deletes the duplicate rows
   *   6. Clears the needsCategoryDedup flag on all processed rows
   *
   * Runs once on server startup via onModuleInit. Safe to re-run: already-cleared
   * rows (needsCategoryDedup=false) are skipped.
   */
  async deduplicateCategoryNames(): Promise<void> {
    const flaggedContexts = await this.userContextRepository.find({
      where: {
        contextKey: ContextKey.EMAIL_CATEGORY,
        needsCategoryDedup: true,
      },
      select: {
        contextId: true,
        userId: true,
        contextValue: true,
        createdAt: true,
      },
    });

    if (flaggedContexts.length === 0) return;

    const byUser = this.groupFlaggedContextsByUserId(flaggedContexts);

    let totalDuplicatesRemoved = 0;

    for (const [userId, contexts] of byUser.entries()) {
      // Group by normalised display name
      const byName = new Map<string, UserContext[]>();
      for (const ctx of contexts) {
        try {
          const displayName = parseCategoryName(ctx.contextValue).toLowerCase();
          const group = byName.get(displayName) ?? [];
          group.push(ctx);
          byName.set(displayName, group);
        } catch {
          // parseCategoryName failure — skip this row
        }
      }

      for (const [displayName, group] of byName.entries()) {
        if (group.length <= 1) continue;

        // Sort ascending by createdAt — index 0 is the oldest (canonical)
        group.sort(
          (ctxA, ctxB) => ctxA.createdAt.getTime() - ctxB.createdAt.getTime(),
        );
        const [canonical, ...duplicates] = group;
        const duplicateIds = duplicates.map((ctx) => ctx.contextId);

        this.logger.warn(
          `[deduplicateCategoryNames] User ${userId}: merging ${duplicates.length} duplicate(s) for "${displayName}" into canonical UUID ${canonical.contextId}`,
        );

        // Re-point email_threads.categoryId from duplicate UUIDs to the canonical one
        for (const dupId of duplicateIds) {
          await this.emailThreadRepository.update(
            { userId, categoryId: dupId },
            { categoryId: canonical.contextId },
          );
        }

        // Delete the duplicate rows
        await this.userContextRepository.delete(duplicateIds);
        totalDuplicatesRemoved += duplicates.length;
      }

      // Clear the needsCategoryDedup flag for all processed rows for this user
      const processedIds = contexts.map((ctx) => ctx.contextId);
      // Some may have been deleted (duplicates); update only surviving rows
      await this.userContextRepository.update(
        { contextId: In(processedIds), needsCategoryDedup: true },
        { needsCategoryDedup: false } as Partial<UserContext>,
      );
    }

    if (totalDuplicatesRemoved > 0) {
      this.logger.log(
        `deduplicateCategoryNames: removed ${totalDuplicatesRemoved} duplicate EMAIL_CATEGORY row(s) across ${byUser.size} user(s)`,
      );
    }
  }
}
