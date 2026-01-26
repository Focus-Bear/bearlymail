import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPgBossJobIndexes1768200000000 implements MigrationInterface {
  name = "AddPgBossJobIndexes1768200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add composite index on name and state for faster COUNT aggregations
    // This speeds up queries like:
    // SELECT COUNT(*) FILTER (WHERE state = 'created') FROM pgboss.job WHERE name = $1
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pgboss_job_name_state 
            ON pgboss.job (name, state)
        `);

    // Add index on singletonkey for faster singleton lookups
    // Note: PgBoss uses camelCase column names without underscores
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pgboss_job_singletonkey 
            ON pgboss.job (singletonkey) 
            WHERE singletonkey IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS pgboss.idx_pgboss_job_name_state`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS pgboss.idx_pgboss_job_singletonkey`,
    );
  }
}
