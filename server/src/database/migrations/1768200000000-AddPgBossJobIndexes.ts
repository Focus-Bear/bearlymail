import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPgBossJobIndexes1768200000000 implements MigrationInterface {
  name = "AddPgBossJobIndexes1768200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if pgboss schema exists before trying to create indexes
    // The pgboss schema is created when the server starts with pg-boss
    const schemaExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss'
      )
    `);

    if (!schemaExists[0]?.exists) {
      // pgboss schema not yet created - indexes will be added on next migration after server starts
      return;
    }

    // pg-boss v10 repartitioned pgboss.job, renamed `singletonkey` ->
    // `singleton_key`, and now builds comprehensive per-partition indexes
    // itself (on name, state, singleton_key, start_after, ...). These v9-era
    // custom indexes are redundant on v10 and reference a column that no longer
    // exists, so skip them when running against a v10+ schema. We detect v10 by
    // the absence of the legacy `singletonkey` column.
    const legacyColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'pgboss'
          AND table_name = 'job'
          AND column_name = 'singletonkey'
      )
    `);

    if (!legacyColumnExists[0]?.exists) {
      // pg-boss v10+ schema — pg-boss manages its own job indexes.
      return;
    }

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pgboss_job_name_state
            ON pgboss.job (name, state)
        `);

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
