import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAlternateNamesToUserContexts1793500000000
  implements MigrationInterface
{
  name = "AddAlternateNamesToUserContexts1793500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_contexts" ADD COLUMN IF NOT EXISTS "alternateNames" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_contexts" DROP COLUMN IF EXISTS "alternateNames"`,
    );
  }
}
