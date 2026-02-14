import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSourceThreadIdsToUserContext1768000000000 implements MigrationInterface {
  name = "AddSourceThreadIdsToUserContext1768000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_contexts" 
      ADD COLUMN IF NOT EXISTS "sourceThreadIds" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_contexts" 
      DROP COLUMN IF EXISTS "sourceThreadIds"
    `);
  }
}
