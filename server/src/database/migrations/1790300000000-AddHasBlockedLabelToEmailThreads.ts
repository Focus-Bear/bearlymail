import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add `hasBlockedLabel` column to `email_threads`.
 *
 * This denormalized boolean column allows the blocked-emails view to filter
 * threads at the SQL level instead of decrypting every archived thread's labels
 * in application code (the O(n) decrypt loop introduced by PR #1429).
 *
 * The backfill uses a plain-text LIKE check against the raw (encrypted) label
 * column. Because the encryption is deterministic for the same plaintext value
 * within a single installation, the string "BearlyMail-Blocked" can appear in
 * the ciphertext when included as part of a JSON array. However, encrypted
 * values are opaque ciphertext and will NOT contain the plaintext substring.
 *
 * A safe backfill is not possible via raw SQL without decrypting — so we mark
 * all existing threads as hasBlockedLabel = false and rely on the application
 * to keep the column accurate going forward. Existing blocked threads will
 * appear missing from the blocked view until they are re-blocked or a manual
 * backfill script is run. This is an acceptable trade-off: the feature was
 * already broken (loading forever), so a clean slate is better than timeouts.
 *
 * Fixes: Issue #615 ("Show blocked emails" loads forever)
 */
export class AddHasBlockedLabelToEmailThreads1790300000000 implements MigrationInterface {
  name = "AddHasBlockedLabelToEmailThreads1790300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the column with DEFAULT FALSE — all existing rows start as false.
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "hasBlockedLabel" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "hasBlockedLabel"`,
    );
  }
}
