import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class ExtendActionItemsForSuggestedActions1770100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const actionItemsTable = await queryRunner.getTable("action_items");
    if (actionItemsTable) {
      // Add actionType column
      const hasActionType = actionItemsTable.findColumnByName("actionType");
      if (!hasActionType) {
        await queryRunner.addColumn(
          "action_items",
          new TableColumn({
            name: "actionType",
            type: "varchar",
            isNullable: true,
            comment:
              "Action type for suggested actions (e.g., 'github_update_status', 'calendar_create_invite'). NULL for regular action items.",
          }),
        );
      }

      // Add reason column (encrypted text)
      const hasReason = actionItemsTable.findColumnByName("reason");
      if (!hasReason) {
        await queryRunner.addColumn(
          "action_items",
          new TableColumn({
            name: "reason",
            type: "text",
            isNullable: true,
            comment: "Explanation/reason for suggested actions",
          }),
        );
      }

      // Add metadata column (encrypted JSON)
      const hasMetadata = actionItemsTable.findColumnByName("metadata");
      if (!hasMetadata) {
        await queryRunner.addColumn(
          "action_items",
          new TableColumn({
            name: "metadata",
            type: "text",
            isNullable: true,
            comment: "Action-specific metadata (e.g., GitHub issue info)",
          }),
        );
      }

      // Add lastEmailId column
      const hasLastEmailId = actionItemsTable.findColumnByName("lastEmailId");
      if (!hasLastEmailId) {
        await queryRunner.addColumn(
          "action_items",
          new TableColumn({
            name: "lastEmailId",
            type: "uuid",
            isNullable: true,
            comment:
              "ID of the last email used for LLM generation of suggested actions",
          }),
        );
      }

      // Add index for cache invalidation checks
      const hasIndex = actionItemsTable.indices.find(
        (index) =>
          index.columnNames.length === 4 &&
          index.columnNames.includes("userId") &&
          index.columnNames.includes("emailThreadId") &&
          index.columnNames.includes("lastEmailId") &&
          index.columnNames.includes("source"),
      );
      if (!hasIndex) {
        await queryRunner.createIndex(
          "action_items",
          new TableIndex({
            name: "IDX_action_items_user_thread_lastEmail_source",
            columnNames: ["userId", "emailThreadId", "lastEmailId", "source"],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const actionItemsTable = await queryRunner.getTable("action_items");
    if (actionItemsTable) {
      // Drop index
      const index = actionItemsTable.indices.find(
        (idx) =>
          idx.columnNames.length === 4 &&
          idx.columnNames.includes("userId") &&
          idx.columnNames.includes("emailThreadId") &&
          idx.columnNames.includes("lastEmailId") &&
          idx.columnNames.includes("source"),
      );
      if (index) {
        await queryRunner.dropIndex(
          "action_items",
          "IDX_action_items_user_thread_lastEmail_source",
        );
      }

      // Drop columns
      const hasLastEmailId = actionItemsTable.findColumnByName("lastEmailId");
      if (hasLastEmailId) {
        await queryRunner.dropColumn("action_items", "lastEmailId");
      }

      const hasMetadata = actionItemsTable.findColumnByName("metadata");
      if (hasMetadata) {
        await queryRunner.dropColumn("action_items", "metadata");
      }

      const hasReason = actionItemsTable.findColumnByName("reason");
      if (hasReason) {
        await queryRunner.dropColumn("action_items", "reason");
      }

      const hasActionType = actionItemsTable.findColumnByName("actionType");
      if (hasActionType) {
        await queryRunner.dropColumn("action_items", "actionType");
      }
    }
  }
}
