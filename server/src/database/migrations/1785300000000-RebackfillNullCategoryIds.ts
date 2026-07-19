import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Re-trigger the category UUID backfill for threads that were previously processed
 * (needsCategoryIdBackfill=false) but still have a null categoryId.
 *
 * Category resolution is now UUID-only (no fuzzy/name-based fallback).
 * Threads with null categoryId will go to Uncategorized until Jeremy runs the
 * recategorise operation manually.
 *
 * This migration resets the backfill flag so the existing backfillCategoryIds()
 * startup job re-processes these threads on next deployment.
 */
export class RebackfillNullCategoryIds1785300000000 implements MigrationInterface {
  name = "RebackfillNullCategoryIds1785300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Reset the backfill flag for threads that:
    // - have a category name assigned (category IS NOT NULL)
    // - but have no UUID stored (categoryId IS NULL)
    // - and were previously marked as already processed (needsCategoryIdBackfill = false)
    //
    // The existing backfillCategoryIds() job will re-process these on next startup.
    // Category resolution is now UUID-only; Jeremy will run manual recategorisation
    // for any threads that still lack a UUID after the backfill.
    const result: Array<{ id: string }> = await queryRunner.query(
      `UPDATE "email_threads"
       SET "needsCategoryIdBackfill" = true
       WHERE "categoryId" IS NULL
         AND "category" IS NOT NULL
         AND "needsCategoryIdBackfill" = false
       RETURNING "id"`,
    );
    console.log(
      `RebackfillNullCategoryIds: reset ${result.length} thread(s) for re-backfill`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot safely reverse: we don't know which rows were changed
    // Setting them back to false would re-suppress the backfill
    await queryRunner.query(
      `UPDATE "email_threads"
       SET "needsCategoryIdBackfill" = false
       WHERE "categoryId" IS NULL
         AND "category" IS NOT NULL
         AND "needsCategoryIdBackfill" = true`,
    );
  }
}
