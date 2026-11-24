import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const TABLE = "reply_drafts";
const THREAD_COLUMN = "emailThreadId";

const NEW_COLUMNS = [
  new TableColumn({
    name: "subject",
    type: "text",
    isNullable: true,
  }),
  new TableColumn({
    name: "cc",
    type: "text",
    isNullable: true,
    comment: "Comma-separated list of Cc recipients",
  }),
  new TableColumn({
    name: "bcc",
    type: "text",
    isNullable: true,
    comment: "Comma-separated list of Bcc recipients",
  }),
  new TableColumn({
    name: "attachments",
    type: "text",
    isNullable: true,
  }),
];

/**
 * Lets an AI assistant prepare complete drafts through the MCP draft tools:
 * a subject, Cc/Bcc and attachments on any draft, and new messages that have
 * no thread yet (null emailThreadId). The unique (userId, emailThreadId) index
 * stays: Postgres treats NULLs as distinct, so a user can hold many new-message
 * drafts but still only one reply draft per thread.
 */
export class AddAssistantDraftFieldsToReplyDrafts1798100000000
  implements MigrationInterface
{
  name = "AddAssistantDraftFieldsToReplyDrafts1798100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(TABLE);
    const missing = NEW_COLUMNS.filter(
      (column) => !table?.findColumnByName(column.name),
    );
    if (missing.length) {
      await queryRunner.addColumns(TABLE, missing);
    }
    await queryRunner.query(
      `ALTER TABLE "${TABLE}" ALTER COLUMN "${THREAD_COLUMN}" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // New-message drafts have nowhere to go once the thread is required again.
    await queryRunner.query(
      `DELETE FROM "${TABLE}" WHERE "${THREAD_COLUMN}" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${TABLE}" ALTER COLUMN "${THREAD_COLUMN}" SET NOT NULL`,
    );
    const table = await queryRunner.getTable(TABLE);
    for (const column of NEW_COLUMNS) {
      if (table?.findColumnByName(column.name)) {
        await queryRunner.dropColumn(TABLE, column.name);
      }
    }
  }
}
