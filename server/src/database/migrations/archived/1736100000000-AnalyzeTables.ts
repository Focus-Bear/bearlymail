import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Performance optimization: Run ANALYZE on tables to update statistics
 * This helps PostgreSQL choose the best query plans for our indexes
 */
export class AnalyzeTables1736100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Analyze tables to update statistics for query planner
    // Note: ANALYZE doesn't take column names - it analyzes the entire table
    await queryRunner.query(`ANALYZE "email_threads"`);
    await queryRunner.query(`ANALYZE "emails"`);
    await queryRunner.query(`ANALYZE "user_contexts"`);
    await queryRunner.query(`ANALYZE "blocked_senders"`);
    console.log(
      "Analyzed email_threads, emails, user_contexts, and blocked_senders tables.",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: ANALYZE doesn't modify schema
  }
}
