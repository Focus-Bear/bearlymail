import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { findCategoryContextIdByName } from "./category-rules-validate.helper";

export interface BackfillCategoryRuleIdsResult {
  dryRun: boolean;
  /** Distinct users found with at least one NULL-categoryId rule. */
  totalUsers: number;
  /** Users processed without throwing. */
  succeededUsers: number;
  /** Users whose backfill threw (e.g. key resolution failed) — retryable. */
  failedUsers: number;
  /** Rules scanned across all users (rows with NULL categoryId). */
  totalScanned: number;
  /** Rules linked to a category (always 0 in dry-run). */
  totalMatched: number;
  /** Rules whose category no longer exists — left null, skipped at match time. */
  totalOrphaned: number;
}

/**
 * Admin-triggered backfill of the `categoryId` FK on `category_rules`.
 *
 * Category rules used to be matched to their category by the encrypted display
 * name (`categoryName`). Renaming a category changed the `UserContext` row but
 * left the rule's stale name behind, silently breaking the link. Migration
 * `1794300000000` added a rename-stable `categoryId` FK; new rules set it
 * directly, but pre-existing rules need this one-shot backfill.
 *
 * Why a service iterated per user (not a SQL/TypeORM migration):
 * Matching requires decrypting BOTH the rule's `categoryName` and each
 * candidate `user_contexts.contextValue`. Under KMS envelope encryption those
 * columns are encrypted with a *per-user* data key resolved via
 * `UserEncryptionService.withUserKey()`. The migration CLI only holds the
 * global key and cannot decrypt re-encrypted users' data. Iterating users and
 * wrapping each in `withUserKey()` lets the TypeORM transformers decrypt under
 * the correct key (the `tryDecrypt` global-key fallback still covers rows not
 * yet re-encrypted). Same split as the contact searchTokens backfill (#2030).
 *
 * Idempotent: only touches rules with `categoryId IS NULL`, so re-running (or a
 * PgBoss retry after an expired job) safely resumes. One user failing (e.g. key
 * resolution error) is isolated and counted, not fatal.
 */
@Injectable()
export class CategoryRuleIdBackfillService {
  private readonly logger = new Logger(CategoryRuleIdBackfillService.name);

  constructor(
    @InjectRepository(CategoryRule)
    private readonly categoryRuleRepository: Repository<CategoryRule>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async backfillAllUsers(
    options: { dryRun?: boolean } = {},
  ): Promise<BackfillCategoryRuleIdsResult> {
    const dryRun = options.dryRun ?? false;

    const userRows: Array<{ userId: string }> =
      await this.categoryRuleRepository
        .createQueryBuilder("rule")
        .select("DISTINCT rule.userId", "userId")
        .where("rule.categoryId IS NULL")
        .getRawMany();

    const result: BackfillCategoryRuleIdsResult = {
      dryRun,
      totalUsers: userRows.length,
      succeededUsers: 0,
      failedUsers: 0,
      totalScanned: 0,
      totalMatched: 0,
      totalOrphaned: 0,
    };

    for (const { userId } of userRows) {
      try {
        const userResult = await this.userEncryptionService.withUserKey(
          userId,
          () => this.backfillUser(userId, dryRun),
        );
        result.succeededUsers += 1;
        result.totalScanned += userResult.scanned;
        result.totalMatched += userResult.matched;
        result.totalOrphaned += userResult.orphaned;
      } catch (error) {
        result.failedUsers += 1;
        this.logger.error(
          `categoryId backfill failed for user ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `category-rule categoryId backfill ${dryRun ? "(dry run) " : ""}done: ` +
        `${result.succeededUsers}/${result.totalUsers} user(s), ` +
        `scanned ${result.totalScanned}, matched ${result.totalMatched}, ` +
        `${result.totalOrphaned} orphaned, ${result.failedUsers} failed.`,
    );
    return result;
  }

  /**
   * Links one user's NULL-categoryId rules to their category. Assumes the
   * caller has established the user's KMS key in ALS (via `withUserKey`) so the
   * entity transformer decrypts `categoryName`. Reuses
   * `findCategoryContextIdByName` — the same resolver the service uses on
   * create/update — so the backfilled id matches what a fresh write produces.
   */
  private async backfillUser(
    userId: string,
    dryRun: boolean,
  ): Promise<{ scanned: number; matched: number; orphaned: number }> {
    const rules = await this.categoryRuleRepository.find({
      where: { userId, categoryId: IsNull() },
      select: {
        id: true,
        categoryName: true,
      },
    });

    let matched = 0;
    let orphaned = 0;

    for (const rule of rules) {
      const categoryId = await findCategoryContextIdByName(
        this.userContextRepository,
        userId,
        rule.categoryName,
      );

      if (!categoryId) {
        // Category was deleted/renamed away — no matching context. Leave null;
        // peekMatchingRule skips null-categoryId rules.
        orphaned++;
        continue;
      }

      if (!dryRun) {
        await this.categoryRuleRepository.update(
          { id: rule.id },
          { categoryId },
        );
      }
      matched++;
    }

    return { scanned: rules.length, matched, orphaned };
  }
}
