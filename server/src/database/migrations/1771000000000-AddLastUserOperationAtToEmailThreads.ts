import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLastUserOperationAtToEmailThreads1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "lastUserOperationAt",
        type: "timestamp",
        isNullable: true,
        comment:
          "Last time user performed an operation (archive, snooze, star) on this thread in BearlyMail. " +
          "Used to prevent sync from overriding user actions.",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("email_threads", "lastUserOperationAt");
  }
}
