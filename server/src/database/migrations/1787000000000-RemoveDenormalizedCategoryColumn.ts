import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Remove denormalized category column from email_threads.
 *
 * Fixes #1293, #1327 — category UUID (categoryId) is the single source of truth.
 * The denormalized category name and migration-helper flag columns are no longer needed.
 *
 * Phase 0 (blocking backfill): Any thread with categoryId=NULL that has a
 * categoryId-resolvable entry in user_contexts will already have been backfilled
 * by the startup backfillCategoryIds() job in prior releases. This migration
 * intentionally skips orphaned threads (no matching contextId) — they fall to
 * "Other" (categoryId IS NULL), which is the correct semantic.
 *
 * Rollback (down): Re-adds the three columns as nullable/default — no data is
 * restored (the encrypted values are gone). Rollback is a last-resort operation.
 */
export class RemoveDenormalizedCategoryColumn1787000000000 implements MigrationInterface {
  name = "RemoveDenormalizedCategoryColumn1787000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the composite index on (userId, category) — no longer needed
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_threads_userId_category"`,
    );

    // 2. Drop the denormalized encrypted category name column
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "category"`,
    );

    // 3. Drop migration-helper flag: needsCategoryRepair
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "needsCategoryRepair"`,
    );

    // 4. Drop migration-helper flag: needsCategoryIdBackfill
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "needsCategoryIdBackfill"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add columns as nullable (no data restored — encrypted values are gone)
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "category" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "needsCategoryRepair" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "needsCategoryIdBackfill" boolean NOT NULL DEFAULT false`,
    );
  }
}
