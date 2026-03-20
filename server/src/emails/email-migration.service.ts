import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { CategoryDedupService } from "./category-dedup.service";

/**
 * Handles one-time data migration and repair tasks that run on startup.
 * Extracted from EmailsService to keep migration logic separate from business logic.
 */
@Injectable()
export class EmailMigrationService implements OnModuleInit {
  private readonly logger = new Logger(EmailMigrationService.name);

  constructor(
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private categoryDedupService: CategoryDedupService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Repair threads flagged by migration 1784000000000 — runs once on startup,
    // no-ops when all flags are already cleared.
    try {
      await this.repairEncryptedCategoryNames();
    } catch (err) {
      // Non-fatal: log but don't block server startup
      this.logger.error("repairEncryptedCategoryNames failed on startup", err);
    }

    // Backfill categoryId UUID for threads that pre-date migration 1785000000000
    // (fix #1146). Runs once on startup; no-ops when all flags are cleared.
    try {
      await this.backfillCategoryIds();
    } catch (err) {
      this.logger.error("backfillCategoryIds failed on startup", err);
    }

    // Deduplicate EMAIL_CATEGORY rows flagged by migration 1786000000000
    // (fix #1258). Runs once on startup; no-ops when all flags are cleared.
    // Logic lives in CategoryDedupService.
    try {
      await this.categoryDedupService.deduplicateCategoryNames();
    } catch (err) {
      this.logger.error("deduplicateCategoryNames failed on startup", err);
    }
  }

  /**
   * Repair email_threads rows flagged by migration 1784000000000.
   *
   * The migration set needsCategoryRepair=true on all threads that have a
   * non-null category.  This method decrypts each thread's category, checks
   * whether it is already an exact match for one of the user's known category
   * names, and if not attempts to canonicalise it via prefix / parenthetical
   * stripping.  The repaired (or confirmed-clean) category is written back and
   * the flag is cleared.
   *
   * Intended to run once on server startup via onModuleInit.  Safe to call
   * multiple times — already-repaired rows (needsCategoryRepair=false) are skipped.
   */
  async repairEncryptedCategoryNames(): Promise<void> {
    // Process in pages to avoid loading all threads into memory at once
    const PAGE_SIZE = 200;
    // Safety cap: 10 000 pages × 200 rows = 2 M threads maximum
    const MAX_PAGES = 10_000;
    let processed = 0;
    let safetyCounter = 0;

    let hasMoreRepairThreads = true;
    while (hasMoreRepairThreads && safetyCounter++ < MAX_PAGES) {
      const threads = await this.emailThreadRepository.find({
        where: { needsCategoryRepair: true },
        select: ["id", "userId", "category", "needsCategoryRepair"],
        take: PAGE_SIZE,
      });

      if (threads.length === 0) {
        hasMoreRepairThreads = false;
        break;
      }

      // Batch-load all user contexts for this page in ONE query (avoids N+1 on startup).
      const uniqueUserIds = [
        ...new Set(threads.map((thread) => thread.userId).filter(Boolean)),
      ];
      const pageContexts =
        uniqueUserIds.length > 0
          ? await this.userContextRepository.find({
              where: {
                userId: In(uniqueUserIds),
                contextKey: ContextKey.EMAIL_CATEGORY,
              },
              select: ["userId", "contextValue"],
            })
          : [];
      const contextsByUser = new Map<string, typeof pageContexts>();
      for (const ctx of pageContexts) {
        const list = contextsByUser.get(ctx.userId) ?? [];
        list.push(ctx);
        contextsByUser.set(ctx.userId, list);
      }

      for (const thread of threads) {
        try {
          const rawCategory = thread.category
            ? EncryptionHelper.decrypt(thread.category)
            : null;
          const contexts = contextsByUser.get(thread.userId) ?? [];
          const canonical = this.resolveCanonicalCategoryName(
            rawCategory,
            contexts,
          );
          await this.emailThreadRepository.update(
            { id: thread.id },
            {
              ...(canonical !== rawCategory ? { category: canonical } : {}),
              needsCategoryRepair: false,
            },
          );
          processed++;
        } catch (err) {
          this.logger.warn(
            `repairEncryptedCategoryNames: failed to repair thread ${thread.id}`,
            err,
          );
          await this.emailThreadRepository.update(
            { id: thread.id },
            { needsCategoryRepair: false },
          );
        }
      }
    }

    if (processed > 0) {
      this.logger.log(
        `repairEncryptedCategoryNames: repaired ${processed} thread(s)`,
      );
    }
  }

  private resolveCanonicalCategoryName(
    rawCategory: string | null,
    contexts: { contextValue: string }[],
  ): string | null {
    if (!rawCategory || rawCategory === "Other") return rawCategory;
    const knownNames = contexts.map((ctx) =>
      ctx.contextValue.split(" - ")[0].trim(),
    );
    const rawLower = rawCategory.toLowerCase().trim();
    const exact = knownNames.find((name) => name.toLowerCase() === rawLower);
    if (exact) return exact;
    const withoutParens = rawLower.replace(/\s*\(.*\)\s*$/, "").trim();
    const parenMatch = knownNames.find(
      (name) => name.toLowerCase() === withoutParens,
    );
    if (parenMatch) return parenMatch;
    const prefix = knownNames.find(
      (name) =>
        rawLower.startsWith(name.toLowerCase()) ||
        name.toLowerCase().startsWith(rawLower),
    );
    return prefix ?? rawCategory;
  }

  /**
   * Populate `categoryId` UUID for threads that pre-date migration 1785000000000.
   * Decrypts each thread's category name and looks it up in the user's UserContext
   * (EMAIL_CATEGORY) rows to find the matching contextId UUID.
   *
   * Runs once on startup via onModuleInit.  Threads where categoryId is already set
   * (needsCategoryIdBackfill=false) are skipped.  Safe to call multiple times.
   */
  async backfillCategoryIds(): Promise<void> {
    const PAGE_SIZE = 200;
    // Safety cap: 10 000 pages × 200 rows = 2 M threads maximum
    const MAX_PAGES = 10_000;
    let processed = 0;
    let safetyCounter = 0;

    let hasMoreBackfillThreads = true;
    while (hasMoreBackfillThreads && safetyCounter++ < MAX_PAGES) {
      const threads = await this.emailThreadRepository.find({
        where: { needsCategoryIdBackfill: true },
        select: ["id", "userId", "category", "needsCategoryIdBackfill"],
        take: PAGE_SIZE,
      });

      if (threads.length === 0) {
        hasMoreBackfillThreads = false;
        break;
      }

      const uniqueUserIds = [
        ...new Set(threads.map((thread) => thread.userId).filter(Boolean)),
      ];
      const pageContexts =
        uniqueUserIds.length > 0
          ? await this.userContextRepository.find({
              where: {
                userId: In(uniqueUserIds),
                contextKey: ContextKey.EMAIL_CATEGORY,
              },
              select: ["userId", "contextId", "contextValue"],
            })
          : [];

      // Build per-user map: normalised-name → contextId
      const contextIdByUserAndName = new Map<string, Map<string, string>>();
      for (const ctx of pageContexts) {
        const name = ctx.contextValue.split(" - ")[0].trim().toLowerCase();
        let byName = contextIdByUserAndName.get(ctx.userId);
        if (!byName) {
          byName = new Map();
          contextIdByUserAndName.set(ctx.userId, byName);
        }
        byName.set(name, ctx.contextId);
      }

      for (const thread of threads) {
        try {
          const byName = contextIdByUserAndName.get(thread.userId);
          const resolvedCategoryId = this.resolveCategoryIdFromMap(
            thread.category,
            byName,
          );
          await this.emailThreadRepository.update(
            { id: thread.id },
            {
              ...(resolvedCategoryId !== null
                ? { categoryId: resolvedCategoryId }
                : {}),
              needsCategoryIdBackfill: false,
            },
          );
          processed++;
        } catch (err) {
          this.logger.warn(
            `backfillCategoryIds: failed for thread ${thread.id}`,
            err,
          );
          await this.emailThreadRepository.update(
            { id: thread.id },
            { needsCategoryIdBackfill: false },
          );
        }
      }
    }

    if (processed > 0) {
      this.logger.log(`backfillCategoryIds: backfilled ${processed} thread(s)`);
    }
  }

  private resolveCategoryIdFromMap(
    encryptedCategory: string | null | undefined,
    byName: Map<string, string> | undefined,
  ): string | null {
    if (!encryptedCategory || !byName) return null;
    const decrypted = EncryptionHelper.decrypt(encryptedCategory);
    if (!decrypted || decrypted === "Other") return null;
    const nameLower = decrypted.toLowerCase().trim();
    const exact = byName.get(nameLower);
    if (exact) return exact;
    const withoutParens = nameLower.replace(/\s*\(.*\)\s*$/, "").trim();
    const parenMatch = byName.get(withoutParens);
    if (parenMatch) return parenMatch;
    for (const [key, id] of byName.entries()) {
      if (nameLower.startsWith(key) || key.startsWith(nameLower)) return id;
    }
    return null;
  }
}
