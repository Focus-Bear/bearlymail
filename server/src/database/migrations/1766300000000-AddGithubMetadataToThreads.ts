import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddGithubMetadataToThreads1766300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add githubMetadata to email_threads
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      const hasGithubMetadata =
        emailThreadsTable.findColumnByName("githubMetadata");
      if (!hasGithubMetadata) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "githubMetadata",
            type: "text",
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove githubMetadata from email_threads
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      const hasGithubMetadata =
        emailThreadsTable.findColumnByName("githubMetadata");
      if (hasGithubMetadata) {
        await queryRunner.dropColumn("email_threads", "githubMetadata");
      }
    }
  }
}
