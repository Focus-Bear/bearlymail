import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddAutoResponseClaimedAtToEmailThreads1797100000000 implements MigrationInterface {
  name = "AddAutoResponseClaimedAtToEmailThreads1797100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "autoResponseClaimedAt",
        type: "timestamp",
        isNullable: true,
        comment:
          "When an auto-responder job claimed this thread, just before sending. Set " +
          "only while NULL, so two concurrent jobs can't both reply to one thread.",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("email_threads", "autoResponseClaimedAt");
  }
}
