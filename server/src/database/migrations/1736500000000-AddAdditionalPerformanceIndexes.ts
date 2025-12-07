import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additional performance indexes for slow queries identified in performance logs:
 * - emails(userId, receivedAt DESC) for history queries
 * - emails(userId, emailThreadId) for JOIN operations in triage suggestions
 * - batch_schedules(userId) for batch-status endpoint
 */
export class AddAdditionalPerformanceIndexes1736500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index for history queries that ORDER BY receivedAt DESC
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'IDX_emails_userId_receivedAt_desc'
        ) THEN
          CREATE INDEX "IDX_emails_userId_receivedAt_desc"
          ON "emails" ("userId", "receivedAt" DESC);
        END IF;
      END $$;
    `);

    // Index for JOIN operations between emails and email_threads
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'IDX_emails_userId_emailThreadId'
        ) THEN
          CREATE INDEX "IDX_emails_userId_emailThreadId"
          ON "emails" ("userId", "emailThreadId");
        END IF;
      END $$;
    `);

    // Index for email_threads covering index for common queries
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'IDX_email_threads_userId_id'
        ) THEN
          CREATE INDEX "IDX_email_threads_userId_id"
          ON "email_threads" ("userId", "id");
        END IF;
      END $$;
    `);

    // Unique index for batch_schedules.userId (one schedule per user)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'IDX_batch_schedules_userId'
        ) THEN
          CREATE UNIQUE INDEX "IDX_batch_schedules_userId"
          ON "batch_schedules" ("userId");
        END IF;
      END $$;
    `);

    // Run ANALYZE to update statistics for query planner
    await queryRunner.query(`ANALYZE emails`);
    await queryRunner.query(`ANALYZE email_threads`);
    await queryRunner.query(`ANALYZE user_contexts`);
    await queryRunner.query(`ANALYZE batch_schedules`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_userId_receivedAt_desc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_userId_emailThreadId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_threads_userId_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_batch_schedules_userId"`);
  }
}
