import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { IsNull, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { LLMService } from "../llm/llm.service";
import { getJobPriority } from "../queue/job-priorities";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { getErrorMessage } from "../types/common";
import { allocateUniqueCategoryKey } from "../utils/category-key.util";
import {
  parseCategoryName,
  parseCategoryValue,
} from "../utils/category-name.util";
import {
  CategoryConsolidationService,
  type ConsolidationResult,
  type PrunedCategory,
  type PruneResult,
} from "./category-consolidation.service";

/**
 * Service for managing email category consolidation and generation.
 * Handles LLM-powered category management operations.
 */
@Injectable()
export class ContextCategoryService {
  private readonly logger = new Logger(ContextCategoryService.name);

  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private llmService: LLMService,
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly categoryConsolidationService: CategoryConsolidationService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Consolidate existing email categories in the database.
   * Called manually via the "Consolidate Categories" button.
   *
   * Delegates to {@link CategoryConsolidationService}, which is non-destructive:
   * it prunes only never-used auto-generated categories and merges ONLY true
   * semantic duplicates within a family, re-pointing each merged category's
   * threads and rules to a survivor. It never collapses the list into broad
   * buckets, so distinct categories (and all user-added ones) are preserved.
   */
  async consolidateExistingCategories(
    userId: string,
  ): Promise<ConsolidationResult> {
    return this.categoryConsolidationService.consolidate(userId);
  }

  /**
   * Preview of the auto-generated categories that have never had a thread and
   * would be removed by {@link pruneUnusedCategories}. Read-only.
   */
  async listUnusedCategories(userId: string): Promise<PrunedCategory[]> {
    return this.categoryConsolidationService.listNeverUsedCategories(userId);
  }

  /**
   * Removes auto-generated categories that have never had a thread assigned.
   * Powers the "Remove unused categories" button. User-added categories are
   * never removed.
   */
  async pruneUnusedCategories(userId: string): Promise<PruneResult> {
    return this.categoryConsolidationService.pruneNeverUsedCategories(userId);
  }

  /**
   * Generate new categories from emails currently in "Other" category.
   * This analyzes the emails and suggests more specific categories that would better organize them.
   */
  async generateCategoriesFromOther(userId: string): Promise<{
    newCategoriesCount: number;
    totalCategoriesCount: number;
    newCategories: Array<{ name: string; description: string }>;
    reclassifyJobsQueued: number;
  }> {
    this.logger.log(
      `[GENERATE-CATEGORIES] Starting category generation from Other emails for user ${userId}`,
    );

    // AI-capacity gate: this call fans out into an LLM category-generation
    // call plus reclassification jobs, so skip it entirely once the user's
    // org has exhausted its plan volume.
    const capacity = await this.subscriptionsService.checkAiCapacity(userId);
    if (!capacity.allowed) {
      this.logger.warn(
        `[GENERATE-CATEGORIES] Skipping category generation for user ${userId}: AI volume limit reached (${capacity.percentUsed}% used)`,
      );
      return {
        newCategoriesCount: 0,
        totalCategoriesCount: 0,
        newCategories: [],
        reclassifyJobsQueued: 0,
      };
    }

    const otherEmails = await this.fetchOtherCategoryEmails(userId);

    if (otherEmails === null || otherEmails.length === 0) {
      return {
        newCategoriesCount: 0,
        totalCategoriesCount: 0,
        newCategories: [],
        reclassifyJobsQueued: 0,
      };
    }

    this.logger.log(
      `[GENERATE-CATEGORIES] Found ${otherEmails.length} emails in "Other" category`,
    );

    // Fetch existing categories
    const existingCategoryContexts = await this.contextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    });

    const existingCategories = this.parseContextsToNameDescription(
      existingCategoryContexts,
    );

    this.logger.log(
      `[GENERATE-CATEGORIES] Found ${existingCategories.length} existing categories`,
    );

    // Call LLM to generate new categories
    const newCategories = await this.llmService.generateCategoriesFromOther(
      otherEmails.map((err) => ({
        from: err.from || "",
        fromName: err.fromName,
        subject: err.subject || "",
        body: cleanEmailContent(
          err.body,
          null,
          BODY_PREVIEW_LENGTHS.BATCH_PREVIEW,
        ),
      })),
      existingCategories,
      undefined,
      userId,
    );

    if (newCategories.length === 0) {
      this.logger.log(
        `[GENERATE-CATEGORIES] No new categories generated from Other emails`,
      );
      return {
        newCategoriesCount: 0,
        totalCategoriesCount: existingCategories.length,
        newCategories: [],
        reclassifyJobsQueued: 0,
      };
    }

    // Save the new categories
    this.logger.log(
      `[GENERATE-CATEGORIES] Saving ${newCategories.length} new categories`,
    );

    await this.saveCategoriesToDb(userId, newCategories);

    // Queue refine-priority jobs for all emails in "Other" to reclassify them
    // with the new categories available
    const reclassifyJobsQueued = await this.queueReclassificationJobs(
      userId,
      otherEmails,
    );

    const result = {
      newCategoriesCount: newCategories.length,
      totalCategoriesCount: existingCategories.length + newCategories.length,
      newCategories,
      reclassifyJobsQueued,
    };

    this.logger.log(
      `[GENERATE-CATEGORIES] Category generation complete: ${result.newCategoriesCount} new categories added (total: ${result.totalCategoriesCount}), ${reclassifyJobsQueued} emails queued for reclassification`,
    );

    return result;
  }

  /**
   * Parse UserContext records into { name, description } objects.
   */
  private parseContextsToNameDescription(
    contexts: UserContext[],
  ): Array<{ name: string; description: string }> {
    return contexts.map((ctx) => {
      const { name, description } = parseCategoryValue(ctx.contextValue);
      return { name, description: description ?? "" };
    });
  }

  /**
   * Persist a list of { name, description } categories as AUTOGENERATED contexts.
   */
  private async saveCategoriesToDb(
    userId: string,
    categories: Array<{ name: string; description: string }>,
  ): Promise<void> {
    // Fix #1258: fetch existing category names to prevent creating duplicates
    const existing = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
        contextValue: true,
        categoryKey: true,
      },
    });
    for (const ctx of existing) {
      decryptUserContextEntityForApi(ctx);
    }
    const existingNames = new Set(
      existing.map((ctx) => parseCategoryName(ctx.contextValue).toLowerCase()),
    );
    const usedKeys = new Set(
      existing
        .map((ctx) => ctx.categoryKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const cat of categories) {
      const normalizedName = cat.name.toLowerCase().trim();
      if (existingNames.has(normalizedName)) {
        this.logger.log(
          `[saveCategoriesToDb] Skipping duplicate category "${cat.name}" for user ${userId}`,
        );
        continue;
      }
      const contextValue = `${cat.name} - ${cat.description}`;
      const categoryKey = allocateUniqueCategoryKey(cat.name, usedKeys);
      const newContext = this.contextRepository.create({
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        contextValue,
        categoryKey,
        source: Source.AUTOGENERATED,
      });
      await this.contextRepository.save(newContext);
      // Track the newly added name to prevent dupes within the same batch
      existingNames.add(normalizedName);
    }
  }

  /**
   * Fetch emails that are in the "Other" category (or have no category set).
   * Returns null when there are no matching thread IDs at all.
   */
  private async fetchOtherCategoryEmails(
    userId: string,
  ): Promise<Email[] | null> {
    // categoryId IS NULL means "Other" (fixes #1293 — denorm column removed).
    const threads = await this.emailThreadRepository.find({
      where: { userId, isArchived: false, categoryId: IsNull() },
      select: {
        id: true,
      },
    });
    const otherThreadIds = threads.map((thread) => thread.id);

    if (otherThreadIds.length === 0) {
      return null;
    }

    return this.emailRepository
      .createQueryBuilder("email")
      .where("email.userId = :userId", { userId })
      .andWhere("email.emailThreadId IN (:...threadIds)", {
        threadIds: otherThreadIds,
      })
      .select([
        "email.id",
        "email.from",
        "email.fromName",
        "email.subject",
        "email.body",
      ])
      .orderBy("email.receivedAt", "DESC")
      .limit(QUERY_LIMITS.PROVIDER_BATCH_SIZE)
      .getMany();
  }

  /**
   * Queue a refine-priority job for each email so they get reclassified with the new categories.
   * Returns the number of successfully queued jobs.
   */
  private async queueReclassificationJobs(
    userId: string,
    emails: Email[],
  ): Promise<number> {
    this.logger.log(
      `[GENERATE-CATEGORIES] Queueing reclassification jobs for ${emails.length} emails in "Other"`,
    );

    let reclassifyJobsQueued = 0;
    for (const email of emails) {
      try {
        await this.boss.send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: email.id, forceRecalculate: true },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-reclassify-${email.id}`,
          },
        );
        reclassifyJobsQueued++;
      } catch (error) {
        this.logger.warn(
          `[GENERATE-CATEGORIES] Failed to queue reclassification job for email ${email.id}: ${getErrorMessage(error)}`,
        );
      }
    }

    this.logger.log(
      `[GENERATE-CATEGORIES] Queued ${reclassifyJobsQueued} reclassification jobs`,
    );
    return reclassifyJobsQueued;
  }
}
