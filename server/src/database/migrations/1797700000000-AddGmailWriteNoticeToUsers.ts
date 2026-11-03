import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.gmailWriteNotice`. Sign-in now asks Google for read-only Gmail,
 * so background jobs that would archive, label or mark read in Gmail skip the
 * write until the user grants gmail.modify; this records that one was skipped
 * so the app can say so once.
 */
export class AddGmailWriteNoticeToUsers1797700000000 implements MigrationInterface {
  name = "AddGmailWriteNoticeToUsers1797700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "gmailWriteNotice" character varying
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."gmailWriteNotice" IS 'One-time notice that a background Gmail write was skipped for lack of the gmail.modify grant: pending (show it) or dismissed; null until a write is first skipped.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "gmailWriteNotice"
    `);
  }
}
