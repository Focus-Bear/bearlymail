import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddBatchDecisionReasonToEmails1771400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasColumn = emailsTable.findColumnByName("batchDecisionReason");
      if (!hasColumn) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "batchDecisionReason",
            type: "varchar",
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasColumn = emailsTable.findColumnByName("batchDecisionReason");
      if (hasColumn) {
        await queryRunner.dropColumn("emails", "batchDecisionReason");
      }
    }
  }
}
