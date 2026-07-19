import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class AddSnoozeFieldsToEmailThreads1770400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "isSnoozed",
        type: "boolean",
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "snoozeUntil",
        type: "timestamp",
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_isSnoozed",
        columnNames: ["userId", "isSnoozed"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "email_threads",
      "IDX_email_threads_userId_isSnoozed",
    );
    await queryRunner.dropColumn("email_threads", "snoozeUntil");
    await queryRunner.dropColumn("email_threads", "isSnoozed");
  }
}
