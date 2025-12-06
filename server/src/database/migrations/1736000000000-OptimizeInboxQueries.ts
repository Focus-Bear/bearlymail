import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance optimization: Add composite indexes and partial indexes for inbox queries
 * These indexes are optimized for the specific query patterns used in getInbox()
 */
export class OptimizeInboxQueries1736000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial index for process mode: only threads with starCount > 0
    // This makes the index smaller and faster for process tab queries
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_email_threads_userId_starCount_process'
        ) THEN
          CREATE INDEX "IDX_email_threads_userId_starCount_process"
          ON "email_threads" ("userId", "starCount")
          WHERE "starCount" > 0;
        END IF;
      END $$;
    `);

    // Partial index for triage mode: only non-archived, non-starred threads
    // This makes the index smaller and faster for triage tab queries
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_email_threads_userId_triage'
        ) THEN
          CREATE INDEX "IDX_email_threads_userId_triage"
          ON "email_threads" ("userId", "starCount")
          WHERE "isArchived" = false AND "starCount" = 0;
        END IF;
      END $$;
    `);

    // Composite index for DISTINCT ON query ordering
    // This helps PostgreSQL optimize the DISTINCT ON with ORDER BY
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_emails_emailThreadId_priority_received'
        ) THEN
          CREATE INDEX "IDX_emails_emailThreadId_priority_received"
          ON "emails" ("emailThreadId", "priorityScore" DESC NULLS LAST, "receivedAt" DESC);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_threads_userId_starCount_process"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_threads_userId_triage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_emailThreadId_priority_received"`);
  }
}

