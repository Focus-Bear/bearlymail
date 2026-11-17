import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "Use your own AI account": adds the user's TypeSafe AI (Jev) key alongside
 * the existing OpenAI/Anthropic key columns, and `aiKeyRejections`, which
 * records when a provider refused the user's key so Settings can say so
 * (AI calls never fall back to BearlyMail's account when a user's key fails).
 */
export class AddOwnAiAccountColumnsToUsers1797760000000 implements MigrationInterface {
  name = "AddOwnAiAccountColumnsToUsers1797760000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "typesafeApiKey" character varying,
      ADD COLUMN IF NOT EXISTS "aiKeyRejections" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "aiKeyRejections",
      DROP COLUMN IF EXISTS "typesafeApiKey"
    `);
  }
}
