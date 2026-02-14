import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddCalendarBookings1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "calendar_bookings",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userId",
            type: "uuid",
          },
          {
            name: "bookingToken",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "googleEventId",
            type: "varchar",
          },
          {
            name: "guestEmail",
            type: "varchar",
          },
          {
            name: "guestName",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "startTime",
            type: "varchar",
          },
          {
            name: "endTime",
            type: "varchar",
          },
          {
            name: "durationMinutes",
            type: "int",
          },
          {
            name: "title",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            default: "'active'",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "now()",
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
      "calendar_bookings",
      new TableIndex({
        name: "IDX_calendar_bookings_userId",
        columnNames: ["userId"],
      }),
    );

    await queryRunner.createIndex(
      "calendar_bookings",
      new TableIndex({
        name: "IDX_calendar_bookings_bookingToken",
        columnNames: ["bookingToken"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "calendar_bookings",
      "IDX_calendar_bookings_bookingToken",
    );
    await queryRunner.dropIndex(
      "calendar_bookings",
      "IDX_calendar_bookings_userId",
    );
    await queryRunner.dropTable("calendar_bookings");
  }
}
