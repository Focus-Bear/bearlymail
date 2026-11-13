import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

const TABLE = "ask_ai_pending_approvals";
const USER_EXPIRY_INDEX = "IDX_ask_ai_pending_approvals_userId_expiresAt";

export class CreateAskAiPendingApprovals1797900000000 implements MigrationInterface {
  name = "CreateAskAiPendingApprovals1797900000000";

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
          { name: "userId", type: "uuid" },
          { name: "argumentsHash", type: "varchar" },
          { name: "state", type: "text" },
          { name: "expiresAt", type: "timestamptz" },
          { name: "createdAt", type: "timestamptz", default: "now()" },
        ],
        foreignKeys: [
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
      new TableIndex({
        name: USER_EXPIRY_INDEX,
        columnNames: ["userId", "expiresAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(TABLE, true);
  }
}
