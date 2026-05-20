import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountsServerToZohoAccounts1793900000000
  implements MigrationInterface
{
  name = "AddAccountsServerToZohoAccounts1793900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zoho_accounts" ADD COLUMN IF NOT EXISTS "accountsServer" TEXT`,
    );
    // Existing rows pre-date DC detection. Force reconnect so we capture the
    // accounts-server from a fresh OAuth callback.
    await queryRunner.query(
      `UPDATE "zoho_accounts" SET "needsRelogin" = true WHERE "accountsServer" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zoho_accounts" DROP COLUMN IF EXISTS "accountsServer"`,
    );
  }
}
