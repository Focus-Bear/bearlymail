import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class RemovePriorityScoreColumn1766600000000 implements MigrationInterface {
  name = "RemovePriorityScoreColumn1766600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on priorityScore first
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const priorityScoreIndex = emailsTable.indices.find(
        (idx) =>
          idx.columnNames.includes("priorityScore") &&
          idx.columnNames.includes("userId"),
      );
      if (priorityScoreIndex) {
        await queryRunner.dropIndex("emails", priorityScoreIndex);
      }
    }

    // Drop the priorityScore column
    const hasPriorityScore = emailsTable?.findColumnByName("priorityScore");
    if (hasPriorityScore) {
      await queryRunner.dropColumn("emails", "priorityScore");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the priorityScore column
    await queryRunner.query(`
      ALTER TABLE "emails" 
      ADD COLUMN "priorityScore" float DEFAULT 50
    `);

    // Re-add the index
    await queryRunner.createIndex(
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_priorityScore",
        columnNames: ["userId", "priorityScore"],
      }),
    );
  }
}
