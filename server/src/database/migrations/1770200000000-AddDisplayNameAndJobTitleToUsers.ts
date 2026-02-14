import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddDisplayNameAndJobTitleToUsers1770200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable("users");
    if (usersTable) {
      // Add displayName column (encrypted)
      const hasDisplayName = usersTable.findColumnByName("displayName");
      if (!hasDisplayName) {
        await queryRunner.addColumn(
          "users",
          new TableColumn({
            name: "displayName",
            type: "text",
            isNullable: true,
            comment:
              "User's preferred display name for email signatures (encrypted). Guessed from email during signup.",
          }),
        );
      }

      // Add jobTitle column (encrypted)
      const hasJobTitle = usersTable.findColumnByName("jobTitle");
      if (!hasJobTitle) {
        await queryRunner.addColumn(
          "users",
          new TableColumn({
            name: "jobTitle",
            type: "text",
            isNullable: true,
            comment:
              "User's job title for context in email replies (encrypted).",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable("users");
    if (usersTable) {
      const hasJobTitle = usersTable.findColumnByName("jobTitle");
      if (hasJobTitle) {
        await queryRunner.dropColumn("users", "jobTitle");
      }

      const hasDisplayName = usersTable.findColumnByName("displayName");
      if (hasDisplayName) {
        await queryRunner.dropColumn("users", "displayName");
      }
    }
  }
}
