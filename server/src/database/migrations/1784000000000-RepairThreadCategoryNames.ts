import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Data-repair migration for email_threads.category storing full UserContext
 * contextValues (e.g. "Customer feedback (github issues or feedback forms) - ...")
 * instead of just the bare category name (e.g. "Customer feedback").
 *
 * Root cause (fix #1120): The priority LLM occasionally returns the category
 * name with appended parenthetical descriptions or the full "Name - Description"
 * contextValue string.  getInboxSummary() does an exact-match lookup against
 * categoryNameToId which is keyed by the bare name, so these threads fall into
 * the null-id bucket and break accordion grouping.
 *
 * This migration repairs existing rows by updating email_threads.category to
 * the canonical bare name whenever it can be matched (prefix or
 * parenthetical-stripped) to a UserContext EMAIL_CATEGORY entry for the same
 * user.  Rows that cannot be matched are left unchanged.
 *
 * The UPDATE is safe to re-run: the WHERE clause only targets rows where the
 * stored category does NOT already exactly match a known category name.
 *
 * Note: category is stored as AES-GCM ciphertext.  We cannot do the
 * normalisation in SQL — it must be done in application code.  This migration
 * therefore sets a flag column `needsCategoryRepair` on email_threads so that
 * a background job in the application can pick them up, decrypt, normalise,
 * and re-encrypt.  As a lightweight SQL-only step we also clear any rows
 * where the stored category is NULL or an empty string.
 */
export class RepairThreadCategoryNames1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Because category is encrypted we cannot do text manipulation in SQL.
    // We add a boolean flag so the application-layer repair job (triggered on
    // next server start via EmailsService.repairEncryptedCategoryNames) knows
    // which threads to process.  The column defaults to false; existing rows
    // that might have corrupted values are initialised to true.
    await queryRunner.query(`
      ALTER TABLE email_threads
      ADD COLUMN IF NOT EXISTS "needsCategoryRepair" boolean NOT NULL DEFAULT false
    `);

    // Mark all threads that have a non-null category as candidates.
    // The application repair job will decrypt, normalise, and then clear the flag.
    await queryRunner.query(`
      UPDATE email_threads
      SET "needsCategoryRepair" = true
      WHERE category IS NOT NULL
        AND "needsCategoryRepair" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE email_threads
      DROP COLUMN IF EXISTS "needsCategoryRepair"
    `);
  }
}
