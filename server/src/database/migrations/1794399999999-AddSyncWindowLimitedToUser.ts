import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.syncWindowLimited`, set during the initial email sync when the
 * mailbox holds more mail than the sync-window policy imports (500 most recent
 * emails / 7-day ongoing window). The client reads it from GET /users/me to
 * show a dismissible "we're not syncing your old emails" banner in the inbox.
 *
 * Issue: sync-window limits (initial cap + 7-day ongoing window).
 */
export class AddSyncWindowLimitedToUser1794399999999
  implements MigrationInterface
{
  name = "AddSyncWindowLimitedToUser1794399999999";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "syncWindowLimited" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."syncWindowLimited" IS 'True when the initial sync skipped older mail (500-email cap / 7-day window). Drives the client ''old emails not synced'' banner.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "syncWindowLimited"
    `);
  }
}
