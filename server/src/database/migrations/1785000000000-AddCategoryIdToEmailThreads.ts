import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryIdToEmailThreads1785000000000 implements MigrationInterface {
  name = "AddCategoryIdToEmailThreads1785000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "categoryId" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_email_threads_category_id" ON "email_threads" ("categoryId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_email_threads_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "categoryId"`,
    );
  }
}
