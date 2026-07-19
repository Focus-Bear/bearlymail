import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEncryptedDataKeyToUsers1791400000000
  implements MigrationInterface
{
  name = "AddEncryptedDataKeyToUsers1791400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryptedDataKey" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "encryptedDataKey"`,
    );
  }
}
