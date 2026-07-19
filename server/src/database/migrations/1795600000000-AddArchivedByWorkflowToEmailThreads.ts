import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds email_threads.archivedByWorkflow — set when a workflow rule (e.g. a
 * category auto-archive) archives the thread, so those threads can be surfaced
 * in the Blocked view alongside blocked-sender/keyword archives.
 */
export class AddArchivedByWorkflowToEmailThreads1795600000000
  implements MigrationInterface
{
  name = "AddArchivedByWorkflowToEmailThreads1795600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD "archivedByWorkflow" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "email_threads"."archivedByWorkflow" IS 'True when the thread was auto-archived by a workflow rule (e.g. a category auto-archive). Surfaces the thread in the Blocked view alongside blocked-sender/keyword archives.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "archivedByWorkflow"`,
    );
  }
}
