import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDebugDataAndConfig1790400000000 implements MigrationInterface {
  name = "AddDebugDataAndConfig1790400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create debug_data table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debug_data" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid,
        "feature" varchar(100) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "debug_data"
        ADD CONSTRAINT "FK_debug_data_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_debug_data_feature_created"
      ON "debug_data" ("feature", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_debug_data_user_feature"
      ON "debug_data" ("userId", "feature")
    `);

    // Create debug_config table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debug_config" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feature" varchar(100) NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT false,
        "description" varchar(500),
        "retentionDays" int NOT NULL DEFAULT 7,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_debug_config_feature"
      ON "debug_config" ("feature")
    `);

    // Seed the priority_analysis_tracking debug feature (disabled by default).
    // String value matches DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING in debug-feature-names.ts.
    await queryRunner.query(`
      INSERT INTO "debug_config" ("feature", "enabled", "description", "retentionDays")
      VALUES (
        'priority_analysis_tracking',
        false,
        'Log each priority analysis LLM call with thread ID, email count, and caller info. Used to detect redundant re-analysis of the same thread.',
        7
      )
      ON CONFLICT ("feature") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "debug_data" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "debug_config" CASCADE`);
  }
}
