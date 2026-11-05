import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

const TABLE = "personal_access_tokens";
const TOKEN_HASH_INDEX = "IDX_personal_access_tokens_tokenHash";
const USER_INDEX = "IDX_personal_access_tokens_userId_revokedAt";

export class CreatePersonalAccessTokens1797600000000
  implements MigrationInterface
{
  name = "CreatePersonalAccessTokens1797600000000";

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
          { name: "name", type: "varchar" },
          { name: "tokenHash", type: "varchar" },
          { name: "tokenPrefix", type: "varchar" },
          { name: "scopes", type: "text", isArray: true },
          { name: "expiresAt", type: "timestamptz", isNullable: true },
          { name: "lastUsedAt", type: "timestamptz", isNullable: true },
          { name: "revokedAt", type: "timestamptz", isNullable: true },
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
    );
    await queryRunner.createIndex(
      TABLE,
      new TableIndex({
        name: TOKEN_HASH_INDEX,
        columnNames: ["tokenHash"],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      TABLE,
      new TableIndex({
        name: USER_INDEX,
        columnNames: ["userId", "revokedAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(TABLE, true);
  }
}
