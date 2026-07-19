import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CategoryKeyAssignmentService } from "../category-keys/category-key-assignment.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  decryptUserContextEntityForApi,
  mapRawUserContextRowToApiEntity,
} from "../encryption/entity-api-decrypt.util";
import { getErrorMessage } from "../types/common";
import { parseCategoryName } from "../utils/category-name.util";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";

export interface CreateContextOptions {
  priority?: number;
  explanation?: string;
  sourceThreadIds?: string[];
}

/**
 * Service for managing user context CRUD operations.
 * Handles creating, reading, updating, and deleting user context items.
 */
@Injectable()
export class ContextCrudService {
  private readonly logger = new Logger(ContextCrudService.name);

  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    private piiRedactionService: ContextPiiRedactionService,
    private categoryKeyAssignmentService: CategoryKeyAssignmentService,
  ) {}

  /**
   * Get all context items for a user
   */
  async getUserContext(userId: string): Promise<UserContext[]> {
    // Raw SQL: TypeORM `find()` can still surface ciphertext for encrypted text
    // columns in some hydration paths; `.query()` never runs column transformers.
    const rawRows = (await this.contextRepository.query(
      `
      SELECT
        "contextId",
        "userId",
        "contextKey",
        "contextValue",
        priority,
        source,
        explanation,
        "sourceThreadIds",
        "createdAt",
        "lastModified",
        "needsCategoryDedup",
        "categoryKey"
      FROM user_contexts
      WHERE "userId" = $1
      ORDER BY "lastModified" DESC
      `,
      [userId],
    )) as Record<string, unknown>[];

    return rawRows.map(mapRawUserContextRowToApiEntity);
  }

  /**
   * Create or update a context item
   */
  async createOrUpdateContext(
    userId: string,
    contextKey: ContextKey,
    contextValue: string,
    source: Source,
    options: CreateContextOptions = {},
  ): Promise<UserContext> {
    const { priority, explanation, sourceThreadIds } = options;

    const existing = await this.contextRepository.findOne({
      where: { userId, contextKey, contextValue },
    });

    // Validate context value is not blank
    const trimmedValue = (contextValue || "").trim();
    if (!trimmedValue || trimmedValue === "") {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Skipping blank context item: key=${contextKey}, value="${contextValue}"`,
      );
      throw new Error(`Context value cannot be blank for key ${contextKey}`);
    }

    // Apply PII redaction to protect user privacy
    const redactedValue = this.piiRedactionService.redactPII(trimmedValue);

    if (existing) {
      return this.persistExistingContextUpdate(
        existing,
        redactedValue,
        source,
        options,
      );
    }

    let categoryKey: string | null = null;
    if (contextKey === ContextKey.EMAIL_CATEGORY) {
      const displayName = parseCategoryName(redactedValue);
      categoryKey =
        await this.categoryKeyAssignmentService.allocateKeyForNewCategory(
          userId,
          displayName,
        );
    }

    const newContext = this.contextRepository.create({
      userId,
      contextKey,
      // Use PII-redacted value
      contextValue: redactedValue,
      categoryKey,
      source,
      priority,
      explanation,
      sourceThreadIds: sourceThreadIds || [],
    });
    const created = await this.contextRepository.save(newContext);
    decryptUserContextEntityForApi(created);
    return created;
  }

  private async persistExistingContextUpdate(
    existing: UserContext,
    redactedValue: string,
    source: Source,
    options: CreateContextOptions,
  ): Promise<UserContext> {
    const { priority, explanation, sourceThreadIds } = options;
    existing.lastModified = new Date();
    existing.contextValue = redactedValue;
    if (source === Source.USER_EDITED) {
      existing.source = Source.USER_EDITED;
    }
    if (priority !== undefined) {
      existing.priority = priority;
    }
    if (explanation !== undefined) {
      existing.explanation = explanation;
    }
    if (sourceThreadIds && sourceThreadIds.length > 0) {
      const existingIds = existing.sourceThreadIds || [];
      existing.sourceThreadIds = [
        ...new Set([...existingIds, ...sourceThreadIds]),
      ];
    }
    const saved = await this.contextRepository.save(existing);
    decryptUserContextEntityForApi(saved);
    return saved;
  }

  /**
   * Update an existing context item
   */
  async updateContext(
    contextId: string,
    userId: string,
    updates: Partial<UserContext>,
  ): Promise<UserContext | null> {
    updates.source = Source.USER_EDITED;
    await this.contextRepository.update({ contextId, userId }, updates);
    const updated = await this.contextRepository.findOne({
      where: { contextId, userId },
    });
    if (updated) {
      decryptUserContextEntityForApi(updated);
    }
    return updated;
  }

  /**
   * Delete a context item
   */
  async deleteContext(contextId: string, userId: string): Promise<void> {
    await this.contextRepository.delete({ contextId, userId });
  }

  /**
   * Approve an UNAPPROVED Q&A item — sets source to AUTOGENERATED.
   * Returns the updated entity, or null if not found / already approved.
   */
  async approveQA(
    contextId: string,
    userId: string,
  ): Promise<UserContext | null> {
    const item = await this.contextRepository.findOne({
      where: { contextId, userId, source: Source.UNAPPROVED },
    });
    if (!item) return null;
    item.source = Source.AUTOGENERATED;
    item.lastModified = new Date();
    const saved = await this.contextRepository.save(item);
    decryptUserContextEntityForApi(saved);
    return saved;
  }

  /**
   * Reject (delete) an UNAPPROVED Q&A item.
   * Returns true if deleted, false if not found.
   */
  async rejectQA(contextId: string, userId: string): Promise<boolean> {
    const item = await this.contextRepository.findOne({
      where: { contextId, userId, source: Source.UNAPPROVED },
    });
    if (!item) return false;
    await this.contextRepository.delete({ contextId, userId });
    return true;
  }

  /**
   * Bulk-approve all UNAPPROVED Q&A for a user.
   * Returns the count of approved items.
   */
  async approveAllQA(userId: string): Promise<number> {
    const result = await this.contextRepository.update(
      {
        userId,
        contextKey: ContextKey.Q_AND_A,
        source: Source.UNAPPROVED,
      },
      { source: Source.AUTOGENERATED, lastModified: new Date() },
    );
    return result.affected ?? 0;
  }

  /**
   * Deduplicate existing autogenerated context by consolidating similar entries
   */
  async deduplicateExistingContext(userId: string): Promise<void> {
    try {
      const existingContext = await this.contextRepository.find({
        where: { userId, source: Source.AUTOGENERATED },
        order: { lastModified: "DESC" },
      });

      existingContext.forEach(decryptUserContextEntityForApi);

      if (existingContext.length <= 1) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] No duplicates to consolidate (${existingContext.length} autogenerated items)`,
        );
        return;
      }

      // Group by contextKey and deduplicate within each group
      const grouped = new Map<ContextKey, UserContext[]>();
      for (const ctx of existingContext) {
        if (!grouped.has(ctx.contextKey)) {
          grouped.set(ctx.contextKey, []);
        }
        grouped.get(ctx.contextKey)!.push(ctx);
      }

      let duplicatesRemoved = 0;
      const toDelete: string[] = [];

      for (const [_key, contexts] of grouped.entries()) {
        if (contexts.length <= 1) continue;

        // Sort by lastModified (keep newest)
        contexts.sort(
          (itemA, itemB) =>
            itemB.lastModified.getTime() - itemA.lastModified.getTime(),
        );

        // Keep the first (newest) and check others for similarity
        const keep = contexts[0];
        for (let i = 1; i < contexts.length; i++) {
          const current = contexts[i];
          try {
            if (
              this.piiRedactionService.areContextValuesSimilar(
                keep.contextValue,
                current.contextValue,
              )
            ) {
              this.logger.log(
                `[CONTEXT-ANALYSIS] Consolidating duplicate: "${current.contextValue.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}..." (keeping newer: "${keep.contextValue.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}...")`,
              );
              toDelete.push(current.contextId);
              duplicatesRemoved++;
            }
          } catch (similarityError) {
            this.logger.warn(
              `[CONTEXT-ANALYSIS] Error checking similarity during deduplication: ${getErrorMessage(similarityError)}`,
            );
            // Continue without marking as duplicate if similarity check fails
          }
        }
      }

      if (toDelete.length > 0) {
        await this.contextRepository.delete(toDelete);
        this.logger.log(
          `[CONTEXT-ANALYSIS] Removed ${duplicatesRemoved} duplicate context items`,
        );
      } else {
        this.logger.log(
          `[CONTEXT-ANALYSIS] No duplicates found in existing context`,
        );
      }
    } catch (error) {
      this.logger.error("Error deduplicating existing context:", error);
      // Don't fail the entire analysis if deduplication fails
    }
  }
}
