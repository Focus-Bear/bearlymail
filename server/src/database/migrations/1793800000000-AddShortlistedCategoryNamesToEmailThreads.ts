import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShortlistedCategoryNamesToEmailThreads1793800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "shortlistedCategoryNames" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "shortlistedCategoryNames"`,
    );
  }
}
