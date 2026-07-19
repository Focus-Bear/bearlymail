import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreateContextAnalysisTable1735400001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create context_analyses table
    await queryRunner.createTable(
      new Table({
        name: "context_analyses",
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
            name: "status",
            type: "enum",
            enum: ["pending", "running", "completed", "failed"],
            default: "'pending'",
          },
          {
            name: "progress",
            type: "int",
            isNullable: true,
          },
          {
            name: "total",
            type: "int",
            isNullable: true,
          },
          {
            name: "threadCount",
            type: "int",
            isNullable: true,
          },
          {
            name: "analyzedCount",
            type: "int",
            isNullable: true,
          },
          {
            name: "stats",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "errorMessage",
            type: "text",
            isNullable: true,
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

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      "context_analyses",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
      }),
    );

    // Add indexes
    await queryRunner.createIndex(
      "context_analyses",
      new TableIndex({
        name: "IDX_context_analyses_userId_status",
        columnNames: ["userId", "status"],
      }),
    );

    await queryRunner.createIndex(
      "context_analyses",
      new TableIndex({
        name: "IDX_context_analyses_userId_createdAt",
        columnNames: ["userId", "createdAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("context_analyses");
    if (table) {
      // Drop foreign keys
      const { foreignKeys } = table;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey("context_analyses", fk);
      }

      // Drop indexes
      const indexes = table.indices;
      for (const index of indexes) {
        await queryRunner.dropIndex("context_analyses", index);
      }

      // Drop table
      await queryRunner.dropTable("context_analyses");
    }
  }
}
