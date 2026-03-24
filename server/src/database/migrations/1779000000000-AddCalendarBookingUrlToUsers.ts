import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddCalendarBookingUrlToUsers1779000000000 implements MigrationInterface {
  name = "AddCalendarBookingUrlToUsers1779000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "calendarBookingUrl",
        type: "character varying",
        isNullable: true,
        comment:
          "User's external calendar booking link for scheduling replies (encrypted)",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "calendarBookingUrl");
  }
}
