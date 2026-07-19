import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreateTokenUsageTable1768100000000 implements MigrationInterface {
  name = "CreateTokenUsageTable1768100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create token_usage table
    await queryRunner.createTable(
      new Table({
        name: "token_usage",
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
            isNullable: true,
          },
          {
            name: "operation",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "provider",
            type: "varchar",
            length: "50",
            isNullable: false,
          },
          {
            name: "model",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "promptTokens",
            type: "int",
            default: 0,
          },
          {
            name: "completionTokens",
            type: "int",
            default: 0,
          },
          {
            name: "totalTokens",
            type: "int",
            default: 0,
          },
          {
            name: "durationMs",
            type: "int",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Add foreign key to users table (nullable)
    await queryRunner.createForeignKey(
      "token_usage",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "SET NULL",
      }),
    );

    // Add indexes for efficient querying
    await queryRunner.createIndex(
      "token_usage",
      new TableIndex({
        name: "IDX_token_usage_operation_createdAt",
        columnNames: ["operation", "createdAt"],
      }),
    );

    await queryRunner.createIndex(
      "token_usage",
      new TableIndex({
        name: "IDX_token_usage_userId_createdAt",
        columnNames: ["userId", "createdAt"],
      }),
    );

    await queryRunner.createIndex(
      "token_usage",
      new TableIndex({
        name: "IDX_token_usage_provider_createdAt",
        columnNames: ["provider", "createdAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("token_usage");
    if (table) {
      // Drop foreign keys
      const { foreignKeys } = table;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey("token_usage", fk);
      }

      // Drop indexes
      const indexes = table.indices;
      for (const index of indexes) {
        await queryRunner.dropIndex("token_usage", index);
      }

      // Drop table
      await queryRunner.dropTable("token_usage");
    }
  }
}
