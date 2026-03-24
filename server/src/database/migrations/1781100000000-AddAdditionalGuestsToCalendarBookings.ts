import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddAdditionalGuestsToCalendarBookings1781100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "calendar_bookings",
      new TableColumn({
        name: "additionalGuests",
        type: "text",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("calendar_bookings", "additionalGuests");
  }
}
