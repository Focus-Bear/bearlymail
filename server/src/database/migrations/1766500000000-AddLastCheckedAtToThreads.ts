import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLastCheckedAtToThreads1766500000000 implements MigrationInterface {
  name = "AddLastCheckedAtToThreads1766500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      const hasLastCheckedAt =
        emailThreadsTable.findColumnByName("lastCheckedAt");
      if (!hasLastCheckedAt) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "lastCheckedAt",
            type: "timestamp",
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      const hasLastCheckedAt =
        emailThreadsTable.findColumnByName("lastCheckedAt");
      if (hasLastCheckedAt) {
        await queryRunner.dropColumn("email_threads", "lastCheckedAt");
      }
    }
  }
}
