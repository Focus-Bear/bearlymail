import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFetchingProgressColumns1768300000000 implements MigrationInterface {
  name = "AddFetchingProgressColumns1768300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add separate columns for fetching progress to avoid race conditions
    // with batch processors updating the stats JSONB column
    await queryRunner.query(`
            ALTER TABLE "context_analyses" 
            ADD COLUMN IF NOT EXISTS "fetchingStatus" varchar,
            ADD COLUMN IF NOT EXISTS "fetchedGeneralCount" integer DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "fetchedSentCount" integer DEFAULT 0
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "context_analyses" 
            DROP COLUMN IF EXISTS "fetchingStatus",
            DROP COLUMN IF EXISTS "fetchedGeneralCount",
            DROP COLUMN IF EXISTS "fetchedSentCount"
        `);
  }
}
