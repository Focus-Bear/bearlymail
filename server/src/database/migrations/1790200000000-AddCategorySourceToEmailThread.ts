import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategorySourceToEmailThread1790200000000 implements MigrationInterface {
  name = "AddCategorySourceToEmailThread1790200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_threads"
      ADD COLUMN IF NOT EXISTS "categorySource" varchar NULL;
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "email_threads"."categorySource" IS
      'Which processing step last set the category: ''summary'' (from summarization step) or ''priority'' (from priority analysis step). Useful for debugging mis-categorisation (issue #1509).';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_threads"
      DROP COLUMN IF EXISTS "categorySource";
    `);
  }
}
