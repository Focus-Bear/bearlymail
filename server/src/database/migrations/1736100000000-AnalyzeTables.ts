import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance optimization: Run ANALYZE on tables to update statistics
 * This helps PostgreSQL choose the best query plans for our indexes
 */
export class AnalyzeTables1736100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Analyze tables to update statistics for query planner
    await queryRunner.query(`ANALYZE email_threads`);
    await queryRunner.query(`ANALYZE emails`);
    
    // Update statistics on indexes
    await queryRunner.query(`ANALYZE email_threads (userId, starCount, isArchived)`);
    await queryRunner.query(`ANALYZE emails (userId, emailThreadId, priorityScore, receivedAt)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: ANALYZE doesn't modify schema
  }
}

