import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreatePromptExamplesTable1771800000000 implements MigrationInterface {
  name = "CreatePromptExamplesTable1771800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "prompt_examples",
        columns: [
          {
            name: "operation",
            type: "varchar",
            length: "100",
            isPrimary: true,
          },
          {
            name: "promptTokens",
            type: "int",
            default: 0,
          },
          {
            name: "promptText",
            type: "text",
          },
          {
            name: "systemPromptText",
            type: "text",
            isNullable: true,
          },
          {
            name: "containsHtml",
            type: "boolean",
            default: false,
          },
          {
            name: "provider",
            type: "varchar",
            length: "50",
          },
          {
            name: "model",
            type: "varchar",
            length: "100",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "capturedAt",
            type: "timestamp",
            default: "now()",
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("prompt_examples");
  }
}
