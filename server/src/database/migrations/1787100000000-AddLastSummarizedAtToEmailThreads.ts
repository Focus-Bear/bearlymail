import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastSummarizedAtToEmailThreads1787100000000 implements MigrationInterface {
  name = "AddLastSummarizedAtToEmailThreads1787100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "lastSummarizedAt" TIMESTAMP DEFAULT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "lastSummarizedAt"`,
    );
  }
}
