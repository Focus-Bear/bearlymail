import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLastEmailSyncAtToUsers1767700000000 implements MigrationInterface {
  name = "AddLastEmailSyncAtToUsers1767700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const usersTable = await queryRunner.getTable("users");
    const hasLastEmailSyncAt = usersTable?.findColumnByName("lastEmailSyncAt");

    if (!hasLastEmailSyncAt) {
      await queryRunner.addColumn(
        "users",
        new TableColumn({
          name: "lastEmailSyncAt",
          type: "timestamp",
          isNullable: true,
          comment: "When user's emails were last synced from email provider",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists before dropping
    const usersTable = await queryRunner.getTable("users");
    const hasLastEmailSyncAt = usersTable?.findColumnByName("lastEmailSyncAt");

    if (hasLastEmailSyncAt) {
      await queryRunner.dropColumn("users", "lastEmailSyncAt");
    }
  }
}
