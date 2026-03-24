import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Backfill categoryId = NULL for email_threads where the referenced
 * user_context no longer exists (orphaned/stale UUID).
 *
 * Fixes #1404 — threads with a stale categoryId were inconsistently treated as
 * "Other" by the summary path (LEFT JOIN returns null categoryName) but excluded
 * by the inbox fetch path (categoryId is non-null, not in active UUIDs). This
 * migration permanently resolves the root cause at the data layer so both paths
 * agree: orphaned threads have categoryId = NULL → "Other" bucket.
 *
 * Safe to re-run: WHERE clause is guarded by IS NOT NULL + NOT EXISTS.
 * Runs in a transaction automatically (TypeORM migration default).
 */
export class BackfillNullCategoryIdForOrphanedThreads1787200000000 implements MigrationInterface {
  name = "BackfillNullCategoryIdForOrphanedThreads1787200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE email_threads thread
      SET "categoryId" = NULL
      WHERE thread."categoryId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM user_contexts uc
          WHERE uc."contextId" = thread."categoryId"
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore orphaned UUIDs once nulled out — this migration is intentionally
    // irreversible. The stale UUIDs referred to deleted user_context rows, so there is
    // nothing meaningful to restore.
  }
}
