import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import { ContextCrudService } from "../context/context-crud.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  type UserContext,
} from "../database/entities/user-context.entity";
import { parseCategoryName } from "../utils/category-name.util";
import { SETTLED_THREAD_PREDICATE } from "./categorisation-progress.service";

export interface CategoryCount {
  /** The EMAIL_CATEGORY context id, or null for "Other". */
  categoryId: string | null;
  /** Display name; null for "Other", which the client localises. */
  name: string | null;
  count: number;
}

interface CategoryCountRow {
  categoryId: string | null;
  count: number | string;
}

/**
 * How many of the user's triage-inbox threads sit in each category, for the
 * onboarding learning step's live "where your emails landed" view while a
 * re-categorisation runs. Counts only threads whose category has settled (the
 * same predicate as CategorisationProgressService), so a thread mid-re-sort
 * isn't shown in its old bucket. Every category is listed, including ones
 * with no threads yet, so a category the user just added is visible at 0.
 */
@Injectable()
export class CategoryCountsService {
  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly contextCrudService: ContextCrudService,
  ) {}

  async getCategoryCounts(userId: string): Promise<CategoryCount[]> {
    const [rows, contexts] = await Promise.all([
      this.queryCountsByCategoryId(userId),
      this.contextCrudService.getUserContext(userId),
    ]);
    return buildCategoryCounts(rows, contexts);
  }

  private async queryCountsByCategoryId(
    userId: string,
  ): Promise<CategoryCountRow[]> {
    return (await this.emailThreadRepository.query(
      `SELECT "categoryId", COUNT(*)::int AS count
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND "starCount" = $2
         AND (${SETTLED_THREAD_PREDICATE})
       GROUP BY "categoryId"`,
      [userId, STAR_COUNTS.NONE],
    )) as CategoryCountRow[];
  }
}

/**
 * Joins the per-id counts onto the user's categories, largest first. A thread
 * pointing at a deleted category is counted as "Other", which is where the
 * inbox shows it too.
 */
export function buildCategoryCounts(
  rows: CategoryCountRow[],
  contexts: UserContext[],
): CategoryCount[] {
  const countById = new Map(
    rows.map((row) => [row.categoryId, Number(row.count) || 0]),
  );
  const categories = contexts.filter(
    (context) => context.contextKey === ContextKey.EMAIL_CATEGORY,
  );
  const knownIds = new Set(categories.map((context) => context.contextId));
  const orphanedCount = rows
    .filter((row) => row.categoryId !== null && !knownIds.has(row.categoryId))
    .reduce((sum, row) => sum + (Number(row.count) || 0), 0);

  const named: CategoryCount[] = categories.map((context) => ({
    categoryId: context.contextId,
    name: parseCategoryName(context.contextValue),
    count: countById.get(context.contextId) ?? 0,
  }));
  const other: CategoryCount = {
    categoryId: null,
    name: null,
    count: (countById.get(null) ?? 0) + orphanedCount,
  };
  return [...named, other].sort((left, right) => right.count - left.count);
}
