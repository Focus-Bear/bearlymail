import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataReencryptedAtToUsers1793100000000
  implements MigrationInterface
{
  name = "AddDataReencryptedAtToUsers1793100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dataReencryptedAt" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "dataReencryptedAt"`,
    );
  }
}
