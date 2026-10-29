import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

const TABLE = "imap_accounts";
const USER_INDEX = "IDX_imap_accounts_userId";

export class CreateImapAccounts1797200000000 implements MigrationInterface {
  name = "CreateImapAccounts1797200000000";

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
          { name: "email", type: "text" },
          { name: "name", type: "varchar", isNullable: true },
          { name: "username", type: "text" },
          { name: "password", type: "text" },
          { name: "imapHost", type: "varchar" },
          { name: "imapPort", type: "integer" },
          { name: "imapSecure", type: "boolean", default: true },
          { name: "smtpHost", type: "varchar" },
          { name: "smtpPort", type: "integer" },
          { name: "smtpSecure", type: "boolean", default: true },
          { name: "archiveMailbox", type: "varchar", isNullable: true },
          { name: "sentMailbox", type: "varchar", isNullable: true },
          { name: "trashMailbox", type: "varchar", isNullable: true },
          { name: "isActive", type: "boolean", default: true },
          { name: "isPrimary", type: "boolean", default: true },
          { name: "needsRelogin", type: "boolean", default: false },
          { name: "lastError", type: "text", isNullable: true },
          { name: "createdAt", type: "timestamp", default: "now()" },
          { name: "updatedAt", type: "timestamp", default: "now()" },
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
      new TableIndex({ name: USER_INDEX, columnNames: ["userId"] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) {
      await queryRunner.dropTable(TABLE);
    }
  }
}
