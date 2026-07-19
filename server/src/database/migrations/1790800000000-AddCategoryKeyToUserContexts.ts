import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stable categoryKey for EMAIL_CATEGORY rows — LLM shortlist returns keys
 * instead of paraphrased display names for reliable matching.
 */
export class AddCategoryKeyToUserContexts1790800000000 implements MigrationInterface {
  name = "AddCategoryKeyToUserContexts1790800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_contexts"
      ADD COLUMN IF NOT EXISTS "categoryKey" character varying(128) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_contexts_user_category_key"
      ON "user_contexts" ("userId", "categoryKey")
      WHERE "categoryKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_contexts_user_category_key"`,
    );
    await queryRunner.query(`
      ALTER TABLE "user_contexts"
      DROP COLUMN IF EXISTS "categoryKey"
    `);
  }
}
