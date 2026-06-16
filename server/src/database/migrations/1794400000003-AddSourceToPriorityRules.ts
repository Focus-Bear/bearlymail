import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `priority_rules.source` ('mined' | 'user'). User-created/edited rules are
 * tagged 'user' so the miner never overwrites or auto-retires them. Existing
 * rows default to 'mined'.
 */
export class AddSourceToPriorityRules1794400000003
  implements MigrationInterface
{
  name = "AddSourceToPriorityRules1794400000003";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "priority_rules" ADD COLUMN IF NOT EXISTS "source" varchar NOT NULL DEFAULT 'mined'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "priority_rules" DROP COLUMN IF EXISTS "source"`,
    );
  }
}
