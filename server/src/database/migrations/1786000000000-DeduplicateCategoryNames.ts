import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Data-repair migration for duplicate EMAIL_CATEGORY rows in user_contexts.
 *
 * Root cause (fix #1258): Multiple code paths in context analysis and category
 * generation could create separate user_contexts rows with the same category
 * display name but different UUIDs for the same user. The frontend then rendered
 * both as separate accordions — and the first instance was often unclickable due
 * to UUID mismatches between the thread's categoryId column and the category
 * UUID the click handler resolved to.
 *
 * Because contextValue is stored as AES-GCM ciphertext, we cannot deduplicate
 * in SQL. Instead, this migration adds a flag column `needsCategoryDedup` on
 * user_contexts so that an application-layer repair job can:
 *   1. Decrypt each EMAIL_CATEGORY row per user
 *   2. Group by display name (first segment before " - ")
 *   3. Keep the oldest UUID (lowest createdAt) as canonical
 *   4. Update any email_threads.categoryId values pointing to deleted UUIDs
 *   5. Delete the duplicate rows
 *   6. Clear the flag on processed rows
 *
 * The flag approach allows the repair to run incrementally on server startup
 * without blocking the migration itself.
 */
export class DeduplicateCategoryNames1786000000000 implements MigrationInterface {
  name = "DeduplicateCategoryNames1786000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add a flag column to mark EMAIL_CATEGORY rows that need dedup processing
    await queryRunner.query(`
      ALTER TABLE user_contexts
      ADD COLUMN IF NOT EXISTS "needsCategoryDedup" boolean NOT NULL DEFAULT false
    `);

    // Mark all EMAIL_CATEGORY rows as candidates for dedup.
    // The application-layer repair job will decrypt, deduplicate, and clear the flag.
    await queryRunner.query(`
      UPDATE user_contexts
      SET "needsCategoryDedup" = true
      WHERE "contextKey" = 'EMAIL_CATEGORY'
        AND "needsCategoryDedup" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_contexts
      DROP COLUMN IF EXISTS "needsCategoryDedup"
    `);
  }
}
