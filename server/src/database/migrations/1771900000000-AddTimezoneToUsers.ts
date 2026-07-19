import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTimezoneToUsers1771900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "timezone",
        type: "varchar",
        isNullable: true,
        default: "'UTC'",
        comment: "User's timezone (e.g., 'America/New_York', 'Europe/London')",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "timezone");
  }
}
