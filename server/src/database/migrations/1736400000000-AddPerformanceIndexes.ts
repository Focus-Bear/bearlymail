import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance optimization: Add indexes for slow endpoints
 * - /context endpoint: index on user_contexts.userId (was taking 3+ seconds)
 * - /batch-status endpoint: index on emails [userId, isBatched, batchReleaseAt] (was taking 3+ seconds)
 */
export class AddPerformanceIndexes1736400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add index on user_contexts.userId for /context endpoint performance
    // This query is called on every inbox load and was taking 3+ seconds
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_user_contexts_userId'
        ) THEN
          CREATE INDEX "IDX_user_contexts_userId"
          ON "user_contexts" ("userId");
        END IF;
      END $$;
    `);

    // Add composite index for filtering by userId and contextKey
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_user_contexts_userId_contextKey'
        ) THEN
          CREATE INDEX "IDX_user_contexts_userId_contextKey"
          ON "user_contexts" ("userId", "contextKey");
        END IF;
      END $$;
    `);

    // Add index on emails [userId, isBatched, batchReleaseAt] for /batch-status endpoint
    // This query finds the next batch release time and was taking 3+ seconds
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'IDX_emails_userId_isBatched_batchReleaseAt'
        ) THEN
          CREATE INDEX "IDX_emails_userId_isBatched_batchReleaseAt"
          ON "emails" ("userId", "isBatched", "batchReleaseAt");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_userId_isBatched_batchReleaseAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_contexts_userId_contextKey"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_contexts_userId"`);
  }
}

