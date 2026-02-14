import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddProcessingFlagsToEmails1735400000000 implements MigrationInterface {
  name = "AddProcessingFlagsToEmails1735400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist before adding them
    const emailsTable = await queryRunner.getTable("emails");

    if (emailsTable) {
      const hasIsProcessingPriority = emailsTable.findColumnByName(
        "isProcessingPriority",
      );
      const hasIsProcessingSummary = emailsTable.findColumnByName(
        "isProcessingSummary",
      );

      if (!hasIsProcessingPriority) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "isProcessingPriority",
            type: "boolean",
            default: false,
          }),
        );
      }

      if (!hasIsProcessingSummary) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "isProcessingSummary",
            type: "boolean",
            default: false,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");

    if (emailsTable) {
      const hasIsProcessingPriority = emailsTable.findColumnByName(
        "isProcessingPriority",
      );
      const hasIsProcessingSummary = emailsTable.findColumnByName(
        "isProcessingSummary",
      );

      if (hasIsProcessingPriority) {
        await queryRunner.dropColumn("emails", "isProcessingPriority");
      }

      if (hasIsProcessingSummary) {
        await queryRunner.dropColumn("emails", "isProcessingSummary");
      }
    }
  }
}
