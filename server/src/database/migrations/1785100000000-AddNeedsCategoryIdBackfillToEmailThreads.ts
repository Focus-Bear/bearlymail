import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNeedsCategoryIdBackfillToEmailThreads1785100000000 implements MigrationInterface {
  name = "AddNeedsCategoryIdBackfillToEmailThreads1785100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "needsCategoryIdBackfill" boolean NOT NULL DEFAULT true`,
    );
    // Only threads that already have a category set need backfilling;
    // threads with no category can be cleared immediately.
    await queryRunner.query(
      `UPDATE "email_threads" SET "needsCategoryIdBackfill" = false WHERE "category" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "needsCategoryIdBackfill"`,
    );
  }
}
