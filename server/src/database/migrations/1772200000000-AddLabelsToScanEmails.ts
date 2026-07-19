import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLabelsToScanEmails1772200000000 implements MigrationInterface {
  name = "AddLabelsToScanEmails1772200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "scan_emails" ADD "labels" text`);
    await queryRunner.query(
      `COMMENT ON COLUMN "scan_emails"."labels" IS 'Email labels from provider (Gmail labels, Office365 categories)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "scan_emails" DROP COLUMN "labels"`);
  }
}
