import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `summarySource` to emails: marks whether `summary` is a real LLM summary
 * ('llm') or a cheap deterministic text placeholder ('deterministic') written
 * for low-priority threads that skipped background summarisation. The detail
 * view uses this to re-trigger an LLM summary when such an email is opened
 * (keeping the placeholder visible meanwhile). NULL when there is no summary.
 */
export class AddSummarySourceToEmails1794900000000
  implements MigrationInterface
{
  name = "AddSummarySourceToEmails1794900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "summarySource" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "summarySource"`,
    );
  }
}
