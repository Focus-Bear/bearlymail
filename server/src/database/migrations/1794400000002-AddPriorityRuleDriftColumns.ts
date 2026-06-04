import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds shadow-comparison counters to `priority_rules` for Phase-3 drift
 * detection. A rule is retired once it has enough shadow samples and its band
 * disagrees with the LLM too often (issue: deterministic priority rules).
 */
export class AddPriorityRuleDriftColumns1794400000002
  implements MigrationInterface
{
  name = "AddPriorityRuleDriftColumns1794400000002";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "priority_rules"
      ADD COLUMN IF NOT EXISTS "shadowSampleCount" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "shadowDivergenceCount" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "priority_rules"
      DROP COLUMN IF EXISTS "shadowDivergenceCount",
      DROP COLUMN IF EXISTS "shadowSampleCount"
    `);
  }
}
