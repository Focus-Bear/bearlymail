import { MigrationInterface, QueryRunner } from "typeorm";

export class MoveBatchFieldsToEmailThread1772300000000 implements MigrationInterface {
  name = "MoveBatchFieldsToEmailThread1772300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add batch columns to email_threads
    await queryRunner.query(`
      ALTER TABLE "email_threads"
        ADD COLUMN IF NOT EXISTS "isBatched" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "batchReleaseAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "wasDeliveredEarly" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "batchDecisionReason" varchar
    `);

    // Step 2: Populate thread batch state from the most recent email per thread
    // We use the most recent email's batch fields as the thread's canonical batch state.
    await queryRunner.query(`
      UPDATE email_threads t
      SET
        "isBatched"          = e."isBatched",
        "batchReleaseAt"     = e."batchReleaseAt",
        "wasDeliveredEarly"  = COALESCE(e."wasDeliveredEarly", false),
        "batchDecisionReason"= e."batchDecisionReason"
      FROM (
        SELECT DISTINCT ON ("emailThreadId")
          "emailThreadId",
          "isBatched",
          "batchReleaseAt",
          "wasDeliveredEarly",
          "batchDecisionReason"
        FROM emails
        ORDER BY "emailThreadId", "receivedAt" DESC, id DESC
      ) e
      WHERE t.id = e."emailThreadId"
    `);

    // Step 3: Release any threads whose batchReleaseAt is already in the past.
    // These are threads that were supposed to be delivered but never got released
    // due to the previous bugs (string/number type mismatch in delivery days).
    await queryRunner.query(`
      UPDATE email_threads
      SET
        "isBatched"           = false,
        "batchDecisionReason" = 'Auto-released: past delivery window'
      WHERE "isBatched" = true
        AND "batchReleaseAt" IS NOT NULL
        AND "batchReleaseAt" < NOW()
    `);

    // Step 4: Add index on email_threads for batch queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_threads_userId_isBatched_batchReleaseAt"
        ON "email_threads" ("userId", "isBatched", "batchReleaseAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_email_threads_userId_isBatched_batchReleaseAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "email_threads"
        DROP COLUMN IF EXISTS "isBatched",
        DROP COLUMN IF EXISTS "batchReleaseAt",
        DROP COLUMN IF EXISTS "wasDeliveredEarly",
        DROP COLUMN IF EXISTS "batchDecisionReason"
    `);
  }
}
