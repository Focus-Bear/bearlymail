import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordChangedAtToUsers1791200000000
  implements MigrationInterface
{
  name = "AddPasswordChangedAtToUsers1791200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordChangedAt"`,
    );
  }
}
