import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `summaryType` to emails: records which summary type produced the cached
 * `summary` (the client's selector value — a built-in type like 'tldr' /
 * 'bullet-points', or 'custom-<ruleId>'). The detail view reads it back so the
 * summary-type selector stays in sync with the displayed summary after
 * navigating away and returning. NULL means the default ('tldr').
 */
export class AddSummaryTypeToEmails1796400000000 implements MigrationInterface {
  name = "AddSummaryTypeToEmails1796400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "summaryType" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "summaryType"`,
    );
  }
}
