import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

const TABLE = "deal_notes";
const DEAL_INDEX = "IDX_deal_notes_dealId";
const USER_INDEX = "IDX_deal_notes_userId";

export class CreateDealNotes1797650000000 implements MigrationInterface {
  name = "CreateDealNotes1797650000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) return;
    await queryRunner.createTable(
      new Table({
        name: TABLE,
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "dealId", type: "uuid" },
          { name: "userId", type: "uuid" },
          { name: "content", type: "text" },
          { name: "createdAt", type: "timestamp", default: "now()" },
          { name: "updatedAt", type: "timestamp", default: "now()" },
        ],
        foreignKeys: [
          {
            columnNames: ["dealId"],
            referencedTableName: "deals",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
          {
            columnNames: ["userId"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      TABLE,
      new TableIndex({ name: DEAL_INDEX, columnNames: ["dealId"] }),
    );
    await queryRunner.createIndex(
      TABLE,
      new TableIndex({ name: USER_INDEX, columnNames: ["userId"] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(TABLE, true);
  }
}
