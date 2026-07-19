import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tracks background "Consolidate Categories" runs so the web request returns
 * immediately and the UI polls for completion. `result` holds the encrypted
 * JSON summary (counts + merged/pruned groups).
 */
export class CreateCategoryConsolidationRuns1794800000000
  implements MigrationInterface
{
  name = "CreateCategoryConsolidationRuns1794800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "category_consolidation_runs_status_enum" AS ENUM
          ('pending', 'running', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "category_consolidation_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" "category_consolidation_runs_status_enum" NOT NULL DEFAULT 'pending',
        "result" text,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_consolidation_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_category_consolidation_runs_user_created" ` +
        `ON "category_consolidation_runs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_consolidation_runs" ADD CONSTRAINT ` +
        `"FK_category_consolidation_runs_user" FOREIGN KEY ("userId") ` +
        `REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_consolidation_runs" DROP CONSTRAINT IF EXISTS "FK_category_consolidation_runs_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_category_consolidation_runs_user_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "category_consolidation_runs"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "category_consolidation_runs_status_enum"`,
    );
  }
}
