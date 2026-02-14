import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class AddPriorityScoreToThreads1769200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");

    if (emailThreadsTable) {
      // Add priorityScore column to email_threads
      const hasPriorityScore =
        emailThreadsTable.findColumnByName("priorityScore");
      if (!hasPriorityScore) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "priorityScore",
            type: "float",
            isNullable: true,
            default: 0,
            comment:
              "Denormalized priority score for efficient sorting (calculated from priorityExplanation breakdown)",
          }),
        );
      }

      // Add index for efficient sorting
      const hasIndex = emailThreadsTable.indices.some(
        (index) =>
          index.columnNames.length === 2 &&
          index.columnNames.includes("userId") &&
          index.columnNames.includes("priorityScore"),
      );
      if (!hasIndex) {
        await queryRunner.createIndex(
          "email_threads",
          new TableIndex({
            name: "IDX_email_threads_userId_priorityScore",
            columnNames: ["userId", "priorityScore"],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");

    if (emailThreadsTable) {
      // Drop index
      const hasIndex = emailThreadsTable.indices.some(
        (index) =>
          index.columnNames.length === 2 &&
          index.columnNames.includes("userId") &&
          index.columnNames.includes("priorityScore"),
      );
      if (hasIndex) {
        await queryRunner.dropIndex(
          "email_threads",
          "IDX_email_threads_userId_priorityScore",
        );
      }

      // Drop column
      const hasPriorityScore =
        emailThreadsTable.findColumnByName("priorityScore");
      if (hasPriorityScore) {
        await queryRunner.dropColumn("email_threads", "priorityScore");
      }
    }
  }
}
