import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { CategoryFamily } from "../database/entities/category-family.entity";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { LLMService } from "../llm/llm.service";
import { parseCategoryValue } from "../utils/category-name.util";
import { CategoryFamilyService } from "./category-family.service";

/** A category that was deleted because it had never had a single thread. */
export interface PrunedCategory {
  name: string;
  reason: "never-used";
}

/** A set of categories merged into one survivor. */
export interface MergedCategoryGroup {
  survivor: string;
  merged: string[];
  family: string;
  threadsReassigned: number;
}

export interface ConsolidationResult {
  originalCount: number;
  consolidatedCount: number;
  userAddedCount: number;
  mergedGroups: MergedCategoryGroup[];
  prunedCategories: PrunedCategory[];
  categories: Array<{
    name: string;
    description: string;
    isUserAdded: boolean;
  }>;
}

export interface PruneResult {
  originalCount: number;
  prunedCount: number;
  remainingCount: number;
  prunedCategories: PrunedCategory[];
}

interface CategoryRecord {
  contextId: string;
  name: string;
  description: string;
  familyId: string | null;
  isUserAdded: boolean;
  threadCount: number;
}

/**
 * Non-destructive "Consolidate Categories" implementation.
 *
 * Unlike the legacy consolidation (which collapsed everything into <=10 broad
 * buckets and orphaned every thread + rule), this service:
 *   1. Prunes only AUTO-GENERATED categories that have NEVER had a thread
 *      assigned (threads are archived, not deleted, so a zero count means the
 *      category was genuinely never used).
 *   2. Within each family, merges ONLY categories the LLM judges to be true
 *      semantic duplicates — re-pointing their threads and rules to a surviving
 *      category, then deleting the now-empty duplicates.
 *   3. Leaves every distinct category, and every user-added category, untouched.
 */
@Injectable()
export class CategoryConsolidationService {
  private readonly logger = new Logger(CategoryConsolidationService.name);

  constructor(
    @InjectRepository(UserContext)
    private readonly contextRepository: Repository<UserContext>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(CategoryRule)
    private readonly categoryRuleRepository: Repository<CategoryRule>,
    @InjectRepository(CategoryFamily)
    private readonly familyRepository: Repository<CategoryFamily>,
    private readonly llmService: LLMService,
    private readonly categoryFamilyService: CategoryFamilyService,
  ) {}

  async consolidate(userId: string): Promise<ConsolidationResult> {
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Starting non-destructive consolidation for user ${userId}`,
    );

    // Make sure families are populated so the merge can be family-scoped.
    await this.categoryFamilyService.ensureFamiliesForUser(userId);

    const records = await this.loadCategoryRecords(userId);
    const originalCount = records.length;
    if (originalCount === 0) {
      return this.emptyResult();
    }

    const userAddedCount = records.filter(
      (record) => record.isUserAdded,
    ).length;

    const { survivors, prunedCategories } = await this.pruneNeverUsed(
      userId,
      records,
    );
    const familyNames = await this.loadFamilyNames(userId);
    const mergedGroups = await this.mergeDuplicatesWithinFamilies(
      userId,
      survivors,
      familyNames,
    );

    const remaining = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });
    for (const ctx of remaining) {
      decryptUserContextEntityForApi(ctx);
    }
    const categories = remaining.map((ctx) => {
      const { name, description } = parseCategoryValue(ctx.contextValue);
      return {
        name,
        description: description ?? "",
        isUserAdded: ctx.source === Source.USER_EDITED,
      };
    });

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Done for user ${userId}: ${originalCount} -> ${categories.length} ` +
        `(${prunedCategories.length} pruned, ${mergedGroups.length} merge group(s))`,
    );

    return {
      originalCount,
      consolidatedCount: categories.length,
      userAddedCount,
      mergedGroups,
      prunedCategories,
      categories,
    };
  }

  /**
   * Preview for the "Remove unused categories" button: the auto-generated
   * categories that have never had a thread assigned (and so would be removed).
   * Does not modify anything.
   */
  async listNeverUsedCategories(userId: string): Promise<PrunedCategory[]> {
    const records = await this.loadCategoryRecords(userId);
    return records
      .filter((record) => !record.isUserAdded && record.threadCount === 0)
      .map((record) => ({ name: record.name, reason: "never-used" as const }));
  }

  /**
   * Deletes the auto-generated categories that have never had a thread assigned
   * (and their rules). User-added categories are never removed. Powers the
   * standalone "Remove unused categories" button.
   */
  async pruneNeverUsedCategories(userId: string): Promise<PruneResult> {
    const records = await this.loadCategoryRecords(userId);
    const originalCount = records.length;
    const { prunedCategories } = await this.pruneNeverUsed(userId, records);
    return {
      originalCount,
      prunedCount: prunedCategories.length,
      remainingCount: originalCount - prunedCategories.length,
      prunedCategories,
    };
  }

  /**
   * Loads every EMAIL_CATEGORY context as a {@link CategoryRecord}, annotated
   * with its lifetime thread count (archived threads included).
   */
  private async loadCategoryRecords(userId: string): Promise<CategoryRecord[]> {
    const contexts = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });
    if (contexts.length === 0) {
      return [];
    }
    // Defensive re-decrypt: guards against any path where the column transformer
    // did not run (e.g. partial selects elsewhere) so contextValue is plaintext.
    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }
    const threadCounts = await this.countThreadsByCategory(userId);
    return contexts.map((ctx) => {
      const { name, description } = parseCategoryValue(ctx.contextValue);
      return {
        contextId: ctx.contextId,
        name,
        description: description ?? "",
        familyId: ctx.familyId,
        isUserAdded: ctx.source === Source.USER_EDITED,
        threadCount: threadCounts.get(ctx.contextId) ?? 0,
      };
    });
  }

  /**
   * Deletes auto-generated categories that have never had a thread assigned.
   * User-added categories are never auto-deleted even when empty (they may be
   * intentional, future-use categories). Returns the survivors plus the list of
   * pruned names.
   */
  private async pruneNeverUsed(
    userId: string,
    records: CategoryRecord[],
  ): Promise<{
    survivors: CategoryRecord[];
    prunedCategories: PrunedCategory[];
  }> {
    const toPrune = records.filter(
      (record) => !record.isUserAdded && record.threadCount === 0,
    );
    if (toPrune.length === 0) {
      return { survivors: records, prunedCategories: [] };
    }

    const pruneIds = toPrune.map((record) => record.contextId);
    await this.deleteRulesForCategories(userId, pruneIds);
    await this.contextRepository.delete(pruneIds);

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Pruned ${toPrune.length} never-used categories: ${toPrune
        .map((record) => record.name)
        .join(", ")}`,
    );

    const prunedSet = new Set(pruneIds);
    return {
      survivors: records.filter((record) => !prunedSet.has(record.contextId)),
      prunedCategories: toPrune.map((record) => ({
        name: record.name,
        reason: "never-used" as const,
      })),
    };
  }

  /**
   * For each family with 2+ categories, asks the LLM which are true duplicates
   * and merges each duplicate group into a single survivor.
   */
  private async mergeDuplicatesWithinFamilies(
    userId: string,
    records: CategoryRecord[],
    familyNames: Map<string, string>,
  ): Promise<MergedCategoryGroup[]> {
    const byFamily = new Map<string, CategoryRecord[]>();
    for (const record of records) {
      // Only merge within a real family — never across families, and never
      // among the unassigned ("Other") bucket.
      if (!record.familyId) continue;
      const group = byFamily.get(record.familyId) ?? [];
      group.push(record);
      byFamily.set(record.familyId, group);
    }

    const mergedGroups: MergedCategoryGroup[] = [];
    for (const [familyId, familyRecords] of byFamily) {
      if (familyRecords.length < 2) continue;
      const familyName = familyNames.get(familyId) ?? "Unknown";

      const duplicateGroups = await this.llmService.identifyDuplicateCategories(
        familyName,
        familyRecords.map((record) => ({
          name: record.name,
          description: record.description,
        })),
        undefined,
        userId,
      );

      const byName = new Map(
        familyRecords.map((record) => [record.name, record]),
      );
      for (const group of duplicateGroups) {
        const members = group.members
          .map((name) => byName.get(name))
          .filter((record): record is CategoryRecord => Boolean(record));
        if (members.length < 2) continue;

        const survivor = this.pickSurvivor(members, group.canonical);
        const losers = members.filter(
          (record) => record.contextId !== survivor.contextId,
        );

        let threadsReassigned = 0;
        for (const loser of losers) {
          threadsReassigned += await this.mergeCategoryInto(
            userId,
            loser,
            survivor,
          );
        }

        mergedGroups.push({
          survivor: survivor.name,
          merged: losers.map((record) => record.name),
          family: familyName,
          threadsReassigned,
        });
        this.logger.log(
          `[CATEGORY-CONSOLIDATION] Merged [${losers.map((record) => record.name).join(", ")}] ` +
            `into "${survivor.name}" (family "${familyName}", ${threadsReassigned} threads)`,
        );
      }
    }
    return mergedGroups;
  }

  /**
   * Re-points a loser category's threads and rules to the survivor, then deletes
   * the loser context. Returns the number of threads reassigned.
   */
  private async mergeCategoryInto(
    userId: string,
    loser: CategoryRecord,
    survivor: CategoryRecord,
  ): Promise<number> {
    const threadUpdate = await this.emailThreadRepository.update(
      { userId, categoryId: loser.contextId },
      { categoryId: survivor.contextId },
    );

    await this.categoryRuleRepository.update(
      { userId, categoryId: loser.contextId },
      { categoryId: survivor.contextId, categoryName: survivor.name },
    );

    await this.contextRepository.delete(loser.contextId);

    return threadUpdate.affected ?? 0;
  }

  /**
   * Picks which category in a duplicate group survives.
   *
   * User-added categories are protected first: if the group contains any
   * user-added category, the survivor is chosen from among those (so a
   * user-added category is never deleted in favour of an auto-generated one,
   * even when the LLM's canonical choice is auto-generated). Otherwise the pool
   * is the whole group. Within the chosen pool we prefer the LLM's canonical
   * choice, then the most-used, then the lexicographically smallest contextId
   * for determinism.
   */
  private pickSurvivor(
    members: CategoryRecord[],
    canonical: string,
  ): CategoryRecord {
    const canonicalRecord = members.find((record) => record.name === canonical);
    const userAdded = members.filter((record) => record.isUserAdded);
    const pool = userAdded.length > 0 ? userAdded : members;

    if (canonicalRecord && pool.includes(canonicalRecord)) {
      return canonicalRecord;
    }
    return [...pool].sort(
      (left, right) =>
        right.threadCount - left.threadCount ||
        left.contextId.localeCompare(right.contextId),
    )[0];
  }

  private async deleteRulesForCategories(
    userId: string,
    categoryIds: string[],
  ): Promise<void> {
    if (categoryIds.length === 0) return;
    await this.categoryRuleRepository.delete({
      userId,
      categoryId: In(categoryIds),
    });
  }

  /** Counts threads per category for the user, including archived threads. */
  private async countThreadsByCategory(
    userId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.categoryId", "categoryId")
      .addSelect("COUNT(*)", "count")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.categoryId IS NOT NULL")
      .groupBy("thread.categoryId")
      .getRawMany<{ categoryId: string; count: string }>();

    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
  }

  private async loadFamilyNames(userId: string): Promise<Map<string, string>> {
    const families = await this.familyRepository.find({ where: { userId } });
    return new Map(families.map((family) => [family.id, family.name]));
  }

  private emptyResult(): ConsolidationResult {
    return {
      originalCount: 0,
      consolidatedCount: 0,
      userAddedCount: 0,
      mergedGroups: [],
      prunedCategories: [],
      categories: [],
    };
  }
}
