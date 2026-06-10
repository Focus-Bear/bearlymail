import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { allocateUniqueCategoryKey } from "../utils/category-key.util";
import { parseCategoryName } from "../utils/category-name.util";

/**
 * Assigns unique per-user categoryKey values when creating EMAIL_CATEGORY contexts.
 */
@Injectable()
export class CategoryKeyAssignmentService {
  constructor(
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
  ) {}

  /**
   * Allocate a new unique categoryKey for this user from the display name (first segment of context value).
   */
  async allocateKeyForNewCategory(
    userId: string,
    displayName: string,
  ): Promise<string> {
    const existingKeys = await this.loadUsedKeys(userId);
    return allocateUniqueCategoryKey(displayName, existingKeys);
  }

  /**
   * All existing categoryKey values for this user's EMAIL_CATEGORY rows.
   */
  async getUsedCategoryKeys(userId: string): Promise<Set<string>> {
    return this.loadUsedKeys(userId);
  }

  private async loadUsedKeys(userId: string): Promise<Set<string>> {
    const rows = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        categoryKey: true,
      },
    });
    const set = new Set<string>();
    for (const row of rows) {
      if (row.categoryKey) {
        set.add(row.categoryKey);
      }
    }
    return set;
  }

  /**
   * Display name from a context value string (Name - Description).
   */
  displayNameFromContextValue(contextValue: string): string {
    return parseCategoryName(contextValue);
  }
}
