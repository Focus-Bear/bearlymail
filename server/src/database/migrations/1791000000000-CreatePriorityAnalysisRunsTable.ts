import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreatePriorityAnalysisRunsTable1791000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "priority_analysis_run_status_enum" AS ENUM ('running', 'completed', 'failed')`,
    );

    await queryRunner.createTable(
      new Table({
        name: "priority_analysis_runs",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "status",
            type: "priority_analysis_run_status_enum",
            default: "'running'",
          },
          {
            name: "totalBatches",
            type: "integer",
            isNullable: false,
          },
          {
            name: "completedBatches",
            type: "integer",
            default: 0,
          },
          {
            name: "threadIds",
            type: "text",
            isNullable: true,
            comment:
              "JSON array of EmailThread IDs locked for this run — used by finalizer to unlock stuck threads",
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

    await queryRunner.createForeignKey(
      "priority_analysis_runs",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createIndex(
      "priority_analysis_runs",
      new TableIndex({
        name: "IDX_priority_analysis_runs_userId_status",
        columnNames: ["userId", "status"],
      }),
    );

    await queryRunner.createIndex(
      "priority_analysis_runs",
      new TableIndex({
        name: "IDX_priority_analysis_runs_userId_createdAt",
        columnNames: ["userId", "createdAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("priority_analysis_runs");
    if (table) {
      for (const fk of table.foreignKeys) {
        await queryRunner.dropForeignKey("priority_analysis_runs", fk);
      }
      for (const index of table.indices) {
        await queryRunner.dropIndex("priority_analysis_runs", index);
      }
    }
    await queryRunner.dropTable("priority_analysis_runs", true);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "priority_analysis_run_status_enum"`,
    );
  }
}
