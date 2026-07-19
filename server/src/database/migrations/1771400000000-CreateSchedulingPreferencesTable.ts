import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateSchedulingPreferencesTable1771400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "scheduling_preferences",
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
            isNullable: false,
          },
          {
            name: "availabilityStartHour",
            type: "int",
            default: 9,
          },
          {
            name: "availabilityEndHour",
            type: "int",
            default: 17,
          },
          {
            name: "availabilityDays",
            type: "text",
            default: "'1,2,3,4,5'",
          },
          {
            name: "meetingGapMinutes",
            type: "int",
            default: 30,
          },
          {
            name: "deepWorkHoursPerDay",
            type: "int",
            default: 2,
          },
          {
            name: "slotDurationMinutes",
            type: "int",
            default: 30,
          },
          {
            name: "timezone",
            type: "varchar",
            default: "'UTC'",
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
    );

    await queryRunner.createIndex(
      "scheduling_preferences",
      new TableIndex({
        name: "IDX_scheduling_preferences_userId",
        columnNames: ["userId"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "scheduling_preferences",
      "IDX_scheduling_preferences_userId",
    );
    await queryRunner.dropTable("scheduling_preferences");
  }
}
