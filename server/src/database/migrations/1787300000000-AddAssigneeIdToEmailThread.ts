import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Batch B — Thread Assignment API (#1112)
 *
 * Adds `assigneeId` (nullable UUID FK → users.id) to `email_threads`.
 * Also creates a composite index on (userId, assigneeId) for efficient
 * inbox queries filtered by assignee.
 *
 * ON DELETE SET NULL ensures threads are not lost if the assignee's account
 * is deleted.
 */
export class AddAssigneeIdToEmailThread1787300000000 implements MigrationInterface {
  name = "AddAssigneeIdToEmailThread1787300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN "assigneeId" uuid NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "email_threads"
       ADD CONSTRAINT "FK_email_threads_assignee"
       FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
       ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_email_threads_userId_assigneeId"
       ON "email_threads" ("userId", "assigneeId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_email_threads_userId_assigneeId"`);

    await queryRunner.query(
      `ALTER TABLE "email_threads"
       DROP CONSTRAINT "FK_email_threads_assignee"`,
    );

    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "assigneeId"`,
    );
  }
}
