import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddOffice365AndZohoAccounts1767558323000 implements MigrationInterface {
  name = "AddOffice365AndZohoAccounts1767558323000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create office365_accounts table
    const office365AccountsTableExists =
      await queryRunner.hasTable("office365_accounts");
    if (!office365AccountsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "office365_accounts",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "microsoftId", type: "varchar" },
            { name: "email", type: "text" },
            { name: "name", type: "varchar", isNullable: true },
            { name: "accessToken", type: "text" },
            { name: "refreshToken", type: "text" },
            { name: "isActive", type: "boolean", default: true },
            { name: "isPrimary", type: "boolean", default: true },
            { name: "needsRelogin", type: "boolean", default: false },
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

      // Create indexes
      await queryRunner.createIndex(
        "office365_accounts",
        new TableIndex({
          name: "IDX_office365_accounts_userId",
          columnNames: ["userId"],
        }),
      );
      await queryRunner.createIndex(
        "office365_accounts",
        new TableIndex({
          name: "IDX_office365_accounts_microsoftId",
          columnNames: ["microsoftId"],
        }),
      );
    }

    // Create zoho_accounts table
    const zohoAccountsTableExists = await queryRunner.hasTable("zoho_accounts");
    if (!zohoAccountsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "zoho_accounts",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "zohoId", type: "varchar" },
            { name: "email", type: "text" },
            { name: "name", type: "varchar", isNullable: true },
            { name: "accessToken", type: "text" },
            { name: "refreshToken", type: "text" },
            { name: "isActive", type: "boolean", default: true },
            { name: "isPrimary", type: "boolean", default: true },
            { name: "needsRelogin", type: "boolean", default: false },
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

      // Create indexes
      await queryRunner.createIndex(
        "zoho_accounts",
        new TableIndex({
          name: "IDX_zoho_accounts_userId",
          columnNames: ["userId"],
        }),
      );
      await queryRunner.createIndex(
        "zoho_accounts",
        new TableIndex({
          name: "IDX_zoho_accounts_zohoId",
          columnNames: ["zohoId"],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    const office365AccountsTable =
      await queryRunner.getTable("office365_accounts");
    if (office365AccountsTable) {
      const index1 = office365AccountsTable.indices.find(
        (idx) => idx.name === "IDX_office365_accounts_userId",
      );
      if (index1) {
        await queryRunner.dropIndex("office365_accounts", index1);
      }
      const index2 = office365AccountsTable.indices.find(
        (idx) => idx.name === "IDX_office365_accounts_microsoftId",
      );
      if (index2) {
        await queryRunner.dropIndex("office365_accounts", index2);
      }
    }

    const zohoAccountsTable = await queryRunner.getTable("zoho_accounts");
    if (zohoAccountsTable) {
      const index1 = zohoAccountsTable.indices.find(
        (idx) => idx.name === "IDX_zoho_accounts_userId",
      );
      if (index1) {
        await queryRunner.dropIndex("zoho_accounts", index1);
      }
      const index2 = zohoAccountsTable.indices.find(
        (idx) => idx.name === "IDX_zoho_accounts_zohoId",
      );
      if (index2) {
        await queryRunner.dropIndex("zoho_accounts", index2);
      }
    }

    // Drop tables
    const office365AccountsTableExists =
      await queryRunner.hasTable("office365_accounts");
    if (office365AccountsTableExists) {
      await queryRunner.dropTable("office365_accounts");
    }

    const zohoAccountsTableExists = await queryRunner.hasTable("zoho_accounts");
    if (zohoAccountsTableExists) {
      await queryRunner.dropTable("zoho_accounts");
    }
  }
}
