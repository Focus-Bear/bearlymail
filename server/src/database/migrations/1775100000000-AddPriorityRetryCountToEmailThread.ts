import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * fix(#1454): Retry failed email prioritisations
 *
 * Adds `priorityRetryCount` (integer, default 0) to `email_threads`.
 * Tracks the number of times priority calculation has been retried for a thread,
 * preventing infinite retry loops when batch prioritisation repeatedly fails.
 */
export class AddPriorityRetryCountToEmailThread1775100000000 implements MigrationInterface {
  name = "AddPriorityRetryCountToEmailThread1775100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "priorityRetryCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "priorityRetryCount"`,
    );
  }
}
