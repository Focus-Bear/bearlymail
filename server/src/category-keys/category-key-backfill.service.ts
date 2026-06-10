import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { allocateUniqueCategoryKey } from "../utils/category-key.util";
import { parseCategoryName } from "../utils/category-name.util";

/**
 * One-time (and idempotent) backfill of categoryKey for existing EMAIL_CATEGORY rows.
 */
@Injectable()
export class CategoryKeyBackfillService {
  private readonly logger = new Logger(CategoryKeyBackfillService.name);

  constructor(
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
  ) {}

  async backfillMissingCategoryKeys(): Promise<void> {
    const rows = await this.userContextRepository.find({
      where: {
        contextKey: ContextKey.EMAIL_CATEGORY,
        categoryKey: IsNull(),
      },
      select: {
        contextId: true,
        userId: true,
        contextValue: true,
        categoryKey: true,
      },
    });

    if (rows.length === 0) {
      return;
    }

    const byUser = new Map<string, UserContext[]>();
    for (const row of rows) {
      decryptUserContextEntityForApi(row);
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }

    let updated = 0;

    for (const [userId, contexts] of byUser.entries()) {
      const usedKeys = await this.loadExistingKeysForUser(userId);
      for (const ctx of contexts) {
        try {
          const displayName = parseCategoryName(ctx.contextValue);
          const key = allocateUniqueCategoryKey(displayName, usedKeys);
          await this.userContextRepository.update(
            { contextId: ctx.contextId },
            { categoryKey: key },
          );
          updated++;
        } catch (err) {
          this.logger.warn(
            `backfillMissingCategoryKeys: skip context ${ctx.contextId}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (updated > 0) {
      this.logger.log(
        `backfillMissingCategoryKeys: assigned categoryKey on ${updated} EMAIL_CATEGORY row(s)`,
      );
    }
  }

  private async loadExistingKeysForUser(userId: string): Promise<Set<string>> {
    const existing = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        categoryKey: true,
      },
    });
    const set = new Set<string>();
    for (const row of existing) {
      if (row.categoryKey) {
        set.add(row.categoryKey);
      }
    }
    return set;
  }
}
