import { MigrationInterface, QueryRunner } from "typeorm";

export class AddActionItemsJsonToEmails1785200000000 implements MigrationInterface {
  name = "AddActionItemsJsonToEmails1785200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("emails");
    if (table && !table.findColumnByName("actionItemsJson")) {
      await queryRunner.query(
        `ALTER TABLE "emails" ADD "actionItemsJson" text`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("emails");
    if (table && table.findColumnByName("actionItemsJson")) {
      await queryRunner.query(
        `ALTER TABLE "emails" DROP COLUMN "actionItemsJson"`,
      );
    }
  }
}
