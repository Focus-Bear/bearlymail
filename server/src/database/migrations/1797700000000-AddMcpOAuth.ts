import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from "typeorm";

const TOKENS_TABLE = "personal_access_tokens";
const CLIENTS_TABLE = "oauth_clients";
const CODES_TABLE = "oauth_authorization_codes";
const REFRESH_HASH_INDEX = "IDX_personal_access_tokens_refreshTokenHash";
const CODE_HASH_INDEX = "IDX_oauth_authorization_codes_codeHash";
const CODES_CREATED_AT_INDEX = "IDX_oauth_authorization_codes_createdAt";

/**
 * OAuth 2.1 for the MCP endpoint: OAuth connections live in
 * `personal_access_tokens` (kind = 'oauth', rotating access + refresh token
 * hashes), dynamically registered clients in `oauth_clients`, and in-flight
 * authorizations / codes in `oauth_authorization_codes`.
 */
export class AddMcpOAuth1797700000000 implements MigrationInterface {
  name = "AddMcpOAuth1797700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addTokenColumns(queryRunner);
    await this.createClientsTable(queryRunner);
    await this.createCodesTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(CODES_TABLE, true);
    await queryRunner.dropTable(CLIENTS_TABLE, true);
    await queryRunner.query(`DROP INDEX IF EXISTS "${REFRESH_HASH_INDEX}"`);
    for (const column of [
      "refreshTokenExpiresAt",
      "refreshTokenHash",
      "oauthClientId",
      "kind",
    ]) {
      if (await queryRunner.hasColumn(TOKENS_TABLE, column)) {
        await queryRunner.dropColumn(TOKENS_TABLE, column);
      }
    }
  }

  private async addTokenColumns(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      new TableColumn({
        name: "kind",
        type: "varchar",
        default: "'personal'",
      }),
      new TableColumn({
        name: "oauthClientId",
        type: "varchar",
        isNullable: true,
      }),
      new TableColumn({
        name: "refreshTokenHash",
        type: "varchar",
        isNullable: true,
      }),
      new TableColumn({
        name: "refreshTokenExpiresAt",
        type: "timestamptz",
        isNullable: true,
      }),
    ];
    for (const column of columns) {
      if (!(await queryRunner.hasColumn(TOKENS_TABLE, column.name))) {
        await queryRunner.addColumn(TOKENS_TABLE, column);
      }
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${REFRESH_HASH_INDEX}" ON "${TOKENS_TABLE}" ("refreshTokenHash")`,
    );
  }

  private async createClientsTable(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(CLIENTS_TABLE)) return;
    await queryRunner.createTable(
      new Table({
        name: CLIENTS_TABLE,
        columns: [
          { name: "id", type: "varchar", isPrimary: true },
          { name: "clientName", type: "varchar" },
          { name: "redirectUris", type: "text", isArray: true },
          { name: "createdAt", type: "timestamptz", default: "now()" },
        ],
      }),
    );
  }

  private async createCodesTable(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(CODES_TABLE)) return;
    await queryRunner.createTable(
      new Table({
        name: CODES_TABLE,
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "clientId", type: "varchar" },
          { name: "clientName", type: "varchar" },
          { name: "redirectUri", type: "text" },
          { name: "state", type: "text", isNullable: true },
          { name: "codeChallenge", type: "varchar" },
          { name: "requestedScopes", type: "text", isArray: true },
          { name: "expiresAt", type: "timestamptz" },
          { name: "userId", type: "uuid", isNullable: true },
          {
            name: "grantedScopes",
            type: "text",
            isArray: true,
            isNullable: true,
          },
          { name: "codeHash", type: "varchar", isNullable: true },
          { name: "codeExpiresAt", type: "timestamptz", isNullable: true },
          { name: "consumedAt", type: "timestamptz", isNullable: true },
          { name: "issuedTokenId", type: "uuid", isNullable: true },
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
      CODES_TABLE,
      new TableIndex({
        name: CODE_HASH_INDEX,
        columnNames: ["codeHash"],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      CODES_TABLE,
      new TableIndex({
        name: CODES_CREATED_AT_INDEX,
        columnNames: ["createdAt"],
      }),
    );
  }
}
