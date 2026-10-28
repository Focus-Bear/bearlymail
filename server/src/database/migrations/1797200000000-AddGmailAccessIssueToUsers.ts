import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.gmailAccessIssue` / `gmailAccessIssueAt`: set when a Gmail fetch
 * fails because the grant lacks the Gmail scopes or was revoked, cleared on
 * the next successful fetch. GET /users/me and GET /emails/sync-status expose
 * it so the inbox can explain an empty mailbox instead of showing nothing.
 */
export class AddGmailAccessIssueToUsers1797200000000
  implements MigrationInterface
{
  name = "AddGmailAccessIssueToUsers1797200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "gmailAccessIssue" character varying,
      ADD COLUMN IF NOT EXISTS "gmailAccessIssueAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."gmailAccessIssue" IS 'Why the last Gmail fetch couldn''t read mail (gmail_access_missing / gmail_access_revoked); null once a fetch succeeds. Drives the client reconnect banner.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."gmailAccessIssueAt" IS 'When gmailAccessIssue was first recorded.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "gmailAccessIssueAt",
      DROP COLUMN IF EXISTS "gmailAccessIssue"
    `);
  }
}
