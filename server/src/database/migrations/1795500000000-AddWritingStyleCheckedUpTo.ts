import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds users.writingStyleCheckedUpTo — the upper bound of the sent-mail window
 * already scanned for writing-style examples. The learning cron previously
 * re-fetched a rolling 7-day window every run, re-validating the same sent
 * emails via LLM when a user was stuck below the example target; with this
 * watermark each sent email is fetched and validated at most once.
 *
 * NULL means "never scanned" and falls back to the 7-day window.
 */
export class AddWritingStyleCheckedUpTo1795500000000
  implements MigrationInterface
{
  name = "AddWritingStyleCheckedUpTo1795500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "writingStyleCheckedUpTo" TIMESTAMP`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."writingStyleCheckedUpTo" IS 'Upper bound of the sent-mail window already scanned for writing-style examples; the learning cron only fetches sent mail after this, so each email is LLM-validated at most once'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "writingStyleCheckedUpTo"`,
    );
  }
}
