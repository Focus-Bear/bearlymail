import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSnoozedThreadsPartialIndex1794200000000
  implements MigrationInterface
{
  name = "AddSnoozedThreadsPartialIndex1794200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_threads_isSnoozed_snoozeUntil"
      ON "email_threads" ("isSnoozed", "snoozeUntil")
      WHERE "isSnoozed" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_threads_isSnoozed_snoozeUntil"`,
    );
  }
}
