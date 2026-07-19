import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateAppleMailAccounts1795200000000
  implements MigrationInterface
{
  name = "CreateAppleMailAccounts1795200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable("apple_mail_accounts");
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: "apple_mail_accounts",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "accountName", type: "varchar" },
            { name: "email", type: "text" },
            { name: "name", type: "varchar", isNullable: true },
            { name: "isActive", type: "boolean", default: true },
            { name: "isPrimary", type: "boolean", default: true },
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
        "apple_mail_accounts",
        new TableIndex({
          name: "IDX_apple_mail_accounts_userId",
          columnNames: ["userId"],
        }),
      );
    }

    const refsTableExists = await queryRunner.hasTable(
      "apple_mail_message_refs",
    );
    if (!refsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "apple_mail_message_refs",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "messageId", type: "varchar" },
            { name: "appleId", type: "bigint" },
            { name: "accountName", type: "varchar" },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        "apple_mail_message_refs",
        new TableIndex({
          name: "IDX_apple_mail_message_refs_userId_messageId",
          columnNames: ["userId", "messageId"],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        "apple_mail_message_refs",
        new TableIndex({
          name: "IDX_apple_mail_message_refs_userId_appleId",
          columnNames: ["userId", "appleId"],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const refsTableExists = await queryRunner.hasTable(
      "apple_mail_message_refs",
    );
    if (refsTableExists) {
      await queryRunner.dropTable("apple_mail_message_refs");
    }

    const table = await queryRunner.getTable("apple_mail_accounts");
    if (table) {
      const index = table.indices.find(
        (idx) => idx.name === "IDX_apple_mail_accounts_userId",
      );
      if (index) {
        await queryRunner.dropIndex("apple_mail_accounts", index);
      }
      await queryRunner.dropTable("apple_mail_accounts");
    }
  }
}
