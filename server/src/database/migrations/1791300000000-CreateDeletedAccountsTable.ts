import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDeletedAccountsTable1791300000000
  implements MigrationInterface
{
  name = "CreateDeletedAccountsTable1791300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."deleted_accounts_deletionreason_enum" AS ENUM('manual', 'inactivity')`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deleted_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "emailHash" character varying NOT NULL,
        "passwordHash" character varying,
        "deletionReason" "public"."deleted_accounts_deletionreason_enum" NOT NULL DEFAULT 'manual',
        "deletedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deleted_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deleted_accounts_emailHash" UNIQUE ("emailHash")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deleted_accounts_emailHash" ON "deleted_accounts" ("emailHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_deleted_accounts_emailHash"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "deleted_accounts"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."deleted_accounts_deletionreason_enum"`,
    );
  }
}
