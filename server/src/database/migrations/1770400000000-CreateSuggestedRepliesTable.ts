import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateSuggestedRepliesTable1770400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "suggested_replies",
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
            comment:
              "The thread ID of the email for which replies are suggested",
          },
          {
            name: "options",
            type: "text",
            isNullable: false,
            comment: "Array of suggested reply options with label and text",
          },
          {
            name: "lastEmailId",
            type: "uuid",
            isNullable: true,
            comment: "The email ID that was used to generate these suggestions",
          },
          {
            name: "isGenerating",
            type: "boolean",
            default: false,
            comment: "Flag to indicate suggestions are being generated",
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
      "suggested_replies",
      new TableIndex({
        name: "IDX_suggested_replies_userId_emailThreadId",
        columnNames: ["userId", "emailThreadId"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "suggested_replies",
      "IDX_suggested_replies_userId_emailThreadId",
    );
    await queryRunner.dropTable("suggested_replies");
  }
}
