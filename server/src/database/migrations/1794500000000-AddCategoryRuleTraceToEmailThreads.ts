import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryRuleTraceToEmailThreads1794500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "categoryRuleTrace" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "categoryRuleTrace"`,
    );
  }
}
