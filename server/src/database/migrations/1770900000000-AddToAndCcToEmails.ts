import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddToAndCcToEmails1770900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasTo = emailsTable.findColumnByName("to");
      if (!hasTo) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "to",
            type: "text",
            isNullable: true,
          }),
        );
      }

      const hasCc = emailsTable.findColumnByName("cc");
      if (!hasCc) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "cc",
            type: "text",
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasTo = emailsTable.findColumnByName("to");
      if (hasTo) {
        await queryRunner.dropColumn("emails", "to");
      }

      const hasCc = emailsTable.findColumnByName("cc");
      if (hasCc) {
        await queryRunner.dropColumn("emails", "cc");
      }
    }
  }
}
