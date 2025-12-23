import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddGithubTokenToUsers1766196987870 implements MigrationInterface {
  name = "AddGithubTokenToUsers1766196987870";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const usersTable = await queryRunner.getTable("users");
    const hasGithubToken = usersTable?.findColumnByName("githubToken");

    if (!hasGithubToken) {
      await queryRunner.addColumn(
        "users",
        new TableColumn({
          name: "githubToken",
          type: "text",
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists before dropping
    const usersTable = await queryRunner.getTable("users");
    const hasGithubToken = usersTable?.findColumnByName("githubToken");

    if (hasGithubToken) {
      await queryRunner.dropColumn("users", "githubToken");
    }
  }
}
