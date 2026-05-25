import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLogoutDiagnosticsToUsers1794000000000
  implements MigrationInterface
{
  name = "AddLogoutDiagnosticsToUsers1794000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLogoutReason" TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLogoutAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLogoutAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLogoutReason"`,
    );
  }
}
