import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

export class AddAccountIdToEmails1739489000000 implements MigrationInterface {
  name = "AddAccountIdToEmails1739489000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist before adding them
    const emailsTable = await queryRunner.getTable("emails");

    if (emailsTable) {
      const hasGoogleAccountId =
        emailsTable.findColumnByName("googleAccountId");
      const hasOffice365AccountId =
        emailsTable.findColumnByName("office365AccountId");
      const hasZohoAccountId = emailsTable.findColumnByName("zohoAccountId");

      // Check if referenced tables exist
      const googleAccountsTable = await queryRunner.getTable("google_accounts");
      const office365AccountsTable =
        await queryRunner.getTable("office365_accounts");
      const zohoAccountsTable = await queryRunner.getTable("zoho_accounts");

      if (!hasGoogleAccountId) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "googleAccountId",
            type: "uuid",
            isNullable: true,
            comment: "Foreign key to google_accounts table",
          }),
        );

        // Add foreign key constraint only if the referenced table exists
        if (googleAccountsTable) {
          await queryRunner.createForeignKey(
            "emails",
            new TableForeignKey({
              columnNames: ["googleAccountId"],
              referencedTableName: "google_accounts",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            }),
          );
        }
      }

      if (!hasOffice365AccountId) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "office365AccountId",
            type: "uuid",
            isNullable: true,
            comment: "Foreign key to office365_accounts table",
          }),
        );

        // Add foreign key constraint only if the referenced table exists
        if (office365AccountsTable) {
          await queryRunner.createForeignKey(
            "emails",
            new TableForeignKey({
              columnNames: ["office365AccountId"],
              referencedTableName: "office365_accounts",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            }),
          );
        }
      }

      if (!hasZohoAccountId) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "zohoAccountId",
            type: "uuid",
            isNullable: true,
            comment: "Foreign key to zoho_accounts table",
          }),
        );

        // Add foreign key constraint only if the referenced table exists
        if (zohoAccountsTable) {
          await queryRunner.createForeignKey(
            "emails",
            new TableForeignKey({
              columnNames: ["zohoAccountId"],
              referencedTableName: "zoho_accounts",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            }),
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");

    if (emailsTable) {
      // Drop foreign keys first
      const googleFk = emailsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("googleAccountId") !== -1,
      );
      if (googleFk) {
        await queryRunner.dropForeignKey("emails", googleFk);
      }

      const office365Fk = emailsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("office365AccountId") !== -1,
      );
      if (office365Fk) {
        await queryRunner.dropForeignKey("emails", office365Fk);
      }

      const zohoFk = emailsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("zohoAccountId") !== -1,
      );
      if (zohoFk) {
        await queryRunner.dropForeignKey("emails", zohoFk);
      }

      // Then drop columns
      const hasGoogleAccountId =
        emailsTable.findColumnByName("googleAccountId");
      if (hasGoogleAccountId) {
        await queryRunner.dropColumn("emails", "googleAccountId");
      }

      const hasOffice365AccountId =
        emailsTable.findColumnByName("office365AccountId");
      if (hasOffice365AccountId) {
        await queryRunner.dropColumn("emails", "office365AccountId");
      }

      const hasZohoAccountId = emailsTable.findColumnByName("zohoAccountId");
      if (hasZohoAccountId) {
        await queryRunner.dropColumn("emails", "zohoAccountId");
      }
    }
  }
}
