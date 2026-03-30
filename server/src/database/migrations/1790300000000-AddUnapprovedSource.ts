import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUnapprovedSource1790300000000 implements MigrationInterface {
  name = "AddUnapprovedSource1790300000000";
  // ALTER TYPE ... ADD VALUE cannot run inside a PostgreSQL transaction
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."user_contexts_source_enum" ADD VALUE IF NOT EXISTS 'UNAPPROVED'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing values from enums without recreating the type
  }
}
