import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWasDeliveredEarlyToEmails1769100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add wasDeliveredEarly column to emails table
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasWasDeliveredEarly =
        emailsTable.findColumnByName("wasDeliveredEarly");
      if (!hasWasDeliveredEarly) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "wasDeliveredEarly",
            type: "boolean",
            default: false,
            isNullable: false,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasWasDeliveredEarly =
        emailsTable.findColumnByName("wasDeliveredEarly");
      if (hasWasDeliveredEarly) {
        await queryRunner.dropColumn("emails", "wasDeliveredEarly");
      }
    }
  }
}
