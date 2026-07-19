import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLastAutoRespondedAtToEmailThreads1780000000000 implements MigrationInterface {
  name = "AddLastAutoRespondedAtToEmailThreads1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "lastAutoRespondedAt",
        type: "timestamp",
        isNullable: true,
        comment:
          "Last time an auto-response was sent for this thread. Used to prevent Gmail sync from " +
          "archiving threads that were recently auto-responded to — sync should not override " +
          "the thread's inbox visibility for at least 24h after an auto-response (Issue #857).",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("email_threads", "lastAutoRespondedAt");
  }
}
