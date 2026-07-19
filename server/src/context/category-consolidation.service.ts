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
import {
  normalizeCategoryNameForDedup,
  parseCategoryValue,
} from "../utils/category-name.util";
import { CategoryFamilyService } from "./category-family.service";
import { OTHER_FAMILY } from "./category-family.taxonomy";

/** Categories with fewer than this many threads are folded into a sibling. */
const RARELY_USED_MAX_THREADS = 5;

/** A category that was removed because it was never used or barely used. */
export interface PrunedCategory {
  name: string;
  reason: "never-used" | "rarely-used";
}

/** A set of categories merged into one survivor. */
export interface MergedCategoryGroup {
  survivor: string;
  merged: string[];
  family: string;
  threadsReassigned: number;
  /** "exact-name" = identical names (no LLM); "semantic" = LLM-judged. */
  method: "exact-name" | "semantic";
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
 * buckets and orphaned every thread + rule), this service reduces category
 * sprawl through four ordered, reversible-in-spirit passes — every thread and
 * rule is re-pointed to a surviving category, never orphaned:
 *
 *   1. Exact-name merge (cross-family, no LLM): categories whose names are
 *      identical once emoji/casing/trailing descriptions are stripped collapse
 *      into one survivor. This is what catches "🚀 App Store Notifications" and
 *      "📱 App Store Notifications" even when they sit in different families.
 *   2. Never-used prune: AUTO-GENERATED categories that have never had a thread
 *      are deleted (a zero count is genuine — threads are archived, not removed).
 *   3. Semantic dedup (cross-family, LLM): the LLM merges only TRUE duplicates
 *      across the remaining categories, re-pointing threads + rules.
 *   4. Rarely-used fold: AUTO-GENERATED categories with a tiny thread count are
 *      folded into the largest surviving category in the SAME family.
 *
 * User-added categories are never deleted or folded.
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

    // Make sure families are populated so the rarely-used fold is family-aware.
    await this.categoryFamilyService.ensureFamiliesForUser(userId);

    const records = await this.loadCategoryRecords(userId);
    const originalCount = records.length;
    if (originalCount === 0) {
      return this.emptyResult();
    }

    const userAddedCount = records.filter(
      (record) => record.isUserAdded,
    ).length;
    const familyNames = await this.loadFamilyNames(userId);

    let working = records;
    const exact = await this.mergeExactNameDuplicates(userId, working);
    working = exact.survivors;

    const prune = await this.pruneNeverUsed(userId, working);
    working = prune.survivors;

    const semantic = await this.mergeSemanticDuplicates(userId, working);
    working = semantic.survivors;

    const fold = await this.foldRarelyUsed(userId, working, familyNames);
    working = fold.survivors;

    const mergedGroups = [...exact.groups, ...semantic.groups];
    const prunedCategories = [...prune.prunedCategories, ...fold.pruned];
    const categories = working
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((record) => ({
        name: record.name,
        description: record.description,
        isUserAdded: record.isUserAdded,
      }));

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
   * Pass 1 — merges categories whose display names are identical once emoji,
   * casing, and trailing descriptions are stripped. Runs ACROSS families (two
   * identically-named categories filed under different families are still the
   * same category). No LLM is involved, so this is risk-free.
   */
  private async mergeExactNameDuplicates(
    userId: string,
    records: CategoryRecord[],
  ): Promise<{ survivors: CategoryRecord[]; groups: MergedCategoryGroup[] }> {
    const byKey = new Map<string, CategoryRecord[]>();
    for (const record of records) {
      const key = normalizeCategoryNameForDedup(record.name);
      if (!key) continue;
      const group = byKey.get(key) ?? [];
      group.push(record);
      byKey.set(key, group);
    }

    const groups: MergedCategoryGroup[] = [];
    const removed = new Set<string>();
    for (const members of byKey.values()) {
      if (members.length < 2) continue;
      const canonical = this.preferredExactSurvivorName(members);
      const { survivor, group } = await this.applyMergeGroup(
        userId,
        members,
        canonical,
        "(exact name)",
        "exact-name",
      );
      groups.push(group);
      for (const member of members) {
        if (member.contextId !== survivor.contextId) {
          removed.add(member.contextId);
        }
      }
    }
    return {
      survivors: records.filter((record) => !removed.has(record.contextId)),
      groups,
    };
  }

  /**
   * Pass 2 — deletes auto-generated categories that have never had a thread
   * assigned. User-added categories are never auto-deleted even when empty
   * (they may be intentional, future-use categories).
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
   * Pass 3 — asks the LLM which of the remaining categories are TRUE semantic
   * duplicates, comparing across ALL families at once, and merges each group
   * into a single survivor. Exact-name duplicates are already gone, so anything
   * found here differs in wording.
   */
  private async mergeSemanticDuplicates(
    userId: string,
    records: CategoryRecord[],
  ): Promise<{ survivors: CategoryRecord[]; groups: MergedCategoryGroup[] }> {
    if (records.length < 2) {
      return { survivors: records, groups: [] };
    }

    const duplicateGroups = await this.llmService.identifyDuplicateCategories(
      "all of your categories",
      records.map((record) => ({
        name: record.name,
        description: record.description,
      })),
      undefined,
      userId,
      true,
    );

    const byName = new Map(records.map((record) => [record.name, record]));
    const groups: MergedCategoryGroup[] = [];
    const removed = new Set<string>();
    for (const duplicateGroup of duplicateGroups) {
      const members = duplicateGroup.members
        .map((name) => byName.get(name))
        .filter(
          (record): record is CategoryRecord =>
            record !== undefined && !removed.has(record.contextId),
        );
      if (members.length < 2) continue;

      const { survivor, group } = await this.applyMergeGroup(
        userId,
        members,
        duplicateGroup.canonical,
        "(cross-family)",
        "semantic",
      );
      groups.push(group);
      for (const member of members) {
        if (member.contextId !== survivor.contextId) {
          removed.add(member.contextId);
        }
      }
    }
    return {
      survivors: records.filter((record) => !removed.has(record.contextId)),
      groups,
    };
  }

  /**
   * Pass 4 — folds each auto-generated category with a tiny thread count into
   * the largest surviving category in the SAME family, re-pointing its threads
   * and rules. Categories in the "Other" family, and user-added categories, are
   * left alone. Smallest categories are folded first so a category that grows
   * past the threshold by absorbing others is no longer a fold candidate.
   */
  private async foldRarelyUsed(
    userId: string,
    records: CategoryRecord[],
    familyNames: Map<string, string>,
  ): Promise<{ survivors: CategoryRecord[]; pruned: PrunedCategory[] }> {
    const survivors = new Map(
      records.map((record) => [record.contextId, record]),
    );
    const candidates = records
      .filter(
        (record) =>
          !record.isUserAdded &&
          record.threadCount > 0 &&
          record.threadCount < RARELY_USED_MAX_THREADS &&
          record.familyId !== null &&
          familyNames.get(record.familyId) !== OTHER_FAMILY,
      )
      .sort((left, right) => left.threadCount - right.threadCount);

    const pruned: PrunedCategory[] = [];
    for (const candidate of candidates) {
      const live = survivors.get(candidate.contextId);
      if (!live || live.threadCount >= RARELY_USED_MAX_THREADS) continue;

      const target = [...survivors.values()]
        .filter(
          (record) =>
            record.contextId !== candidate.contextId &&
            record.familyId === candidate.familyId,
        )
        .sort(
          (left, right) =>
            right.threadCount - left.threadCount ||
            left.contextId.localeCompare(right.contextId),
        )[0];
      if (!target) continue;

      const moved = await this.mergeCategoryInto(userId, live, target);
      target.threadCount += live.threadCount;
      survivors.delete(candidate.contextId);
      pruned.push({ name: candidate.name, reason: "rarely-used" });
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Folded rarely-used "${candidate.name}" ` +
          `(${moved} threads) into "${target.name}"`,
      );
    }
    return { survivors: [...survivors.values()], pruned };
  }

  /**
   * Picks the survivor of a group, merges every other member into it (threads +
   * rules re-pointed, loser context deleted), and returns the survivor plus a
   * summary. The survivor's in-memory thread count absorbs the losers' so later
   * passes see accurate totals.
   */
  private async applyMergeGroup(
    userId: string,
    members: CategoryRecord[],
    canonical: string,
    familyLabel: string,
    method: MergedCategoryGroup["method"],
  ): Promise<{ survivor: CategoryRecord; group: MergedCategoryGroup }> {
    const survivor = this.pickSurvivor(members, canonical);
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
    survivor.threadCount += losers.reduce(
      (sum, loser) => sum + loser.threadCount,
      0,
    );

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Merged [${losers
        .map((record) => record.name)
        .join(", ")}] into "${survivor.name}" ` +
        `(${method}, ${threadsReassigned} threads)`,
    );

    return {
      survivor,
      group: {
        survivor: survivor.name,
        merged: losers.map((record) => record.name),
        family: familyLabel,
        threadsReassigned,
        method,
      },
    };
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
   * Name to prefer as the survivor of an exact-name group: prefer a member that
   * already belongs to a family (so the survivor keeps its family), then the
   * most-used, then the lexicographically smallest contextId for determinism.
   * The actual survivor is still chosen by {@link pickSurvivor}, which protects
   * user-added categories.
   */
  private preferredExactSurvivorName(members: CategoryRecord[]): string {
    return [...members].sort(
      (left, right) =>
        Number(right.familyId !== null) - Number(left.familyId !== null) ||
        right.threadCount - left.threadCount ||
        left.contextId.localeCompare(right.contextId),
    )[0].name;
  }

  /**
   * Picks which category in a group survives.
   *
   * User-added categories are protected first: if the group contains any
   * user-added category, the survivor is chosen from among those (so a
   * user-added category is never deleted in favour of an auto-generated one).
   * Otherwise the pool is the whole group. Within the chosen pool we prefer the
   * canonical choice, then the most-used, then the lexicographically smallest
   * contextId for determinism.
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
