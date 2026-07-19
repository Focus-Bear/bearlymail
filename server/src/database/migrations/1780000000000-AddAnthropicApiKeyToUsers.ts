import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnthropicApiKeyToUsers1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "anthropicApiKey" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "anthropicApiKey"`,
    );
  }
}
