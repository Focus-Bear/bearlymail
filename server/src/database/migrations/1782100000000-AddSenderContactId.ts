import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSenderContactId1782100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "senderContactId" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "senderContactId"`,
    );
  }
}
