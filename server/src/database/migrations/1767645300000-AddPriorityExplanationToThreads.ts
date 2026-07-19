import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddPriorityExplanationToThreads1767645300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");

    if (emailThreadsTable) {
      // Add priorityExplanation column to email_threads
      const hasPriorityExplanation = emailThreadsTable.findColumnByName(
        "priorityExplanation",
      );
      if (!hasPriorityExplanation) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "priorityExplanation",
            type: "text",
            isNullable: true,
            comment: "Precomputed priority explanation (thread-level)",
          }),
        );
      }

      // Add isProcessingPriority column to email_threads
      const hasIsProcessingPriority = emailThreadsTable.findColumnByName(
        "isProcessingPriority",
      );
      if (!hasIsProcessingPriority) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "isProcessingPriority",
            type: "boolean",
            default: false,
            comment:
              "Flag to indicate LLM priority is being calculated for this thread",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");

    if (emailThreadsTable) {
      const hasIsProcessingPriority = emailThreadsTable.findColumnByName(
        "isProcessingPriority",
      );
      if (hasIsProcessingPriority) {
        await queryRunner.dropColumn("email_threads", "isProcessingPriority");
      }

      const hasPriorityExplanation = emailThreadsTable.findColumnByName(
        "priorityExplanation",
      );
      if (hasPriorityExplanation) {
        await queryRunner.dropColumn("email_threads", "priorityExplanation");
      }
    }
  }
}
