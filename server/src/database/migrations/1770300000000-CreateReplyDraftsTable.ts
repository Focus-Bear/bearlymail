import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateReplyDraftsTable1770300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "reply_drafts",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "emailThreadId",
            type: "varchar",
            isNullable: false,
            comment: "The thread ID of the email being replied to",
          },
          {
            name: "content",
            type: "text",
            isNullable: false,
          },
          {
            name: "replyMode",
            type: "varchar",
            length: "20",
            default: "'reply'",
            comment: "Reply mode: reply or replyAll",
          },
          {
            name: "recipients",
            type: "text",
            isNullable: true,
            comment: "Comma-separated list of recipients",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "reply_drafts",
      new TableIndex({
        name: "IDX_reply_drafts_userId_emailThreadId",
        columnNames: ["userId", "emailThreadId"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "reply_drafts",
      "IDX_reply_drafts_userId_emailThreadId",
    );
    await queryRunner.dropTable("reply_drafts");
  }
}
