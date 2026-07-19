import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Partial index for StuckPriorityDetectionService's cross-user scan for threads
 * stuck mid-calculation (isProcessingPriority=true, ordered by updatedAt). The
 * existing [userId, isProcessingPriority] index can't serve a userId-less query,
 * so this avoids a full-table scan. Partial (WHERE isProcessingPriority = true)
 * so it only indexes the tiny set of in-flight threads.
 */
export class AddStuckProcessingPartialIndex1795000000000
  implements MigrationInterface
{
  name = "AddStuckProcessingPartialIndex1795000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_threads_stuck_processing"
      ON "email_threads" ("updatedAt")
      WHERE "isProcessingPriority" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_threads_stuck_processing"`,
    );
  }
}
