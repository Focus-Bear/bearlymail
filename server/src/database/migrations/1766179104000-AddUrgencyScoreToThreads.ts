import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class AddUrgencyScoreToThreads1766179104000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add urgencyScore to email_threads
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      const hasUrgencyScore =
        emailThreadsTable.findColumnByName("urgencyScore");
      if (!hasUrgencyScore) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "urgencyScore",
            type: "float",
            default: 0,
          }),
        );
      }

      const hasUrgencyExplanation =
        emailThreadsTable.findColumnByName("urgencyExplanation");
      if (!hasUrgencyExplanation) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "urgencyExplanation",
            type: "text",
            isNullable: true,
          }),
        );
      }

      const hasUrgencyOverrideReason = emailThreadsTable.findColumnByName(
        "urgencyOverrideReason",
      );
      if (!hasUrgencyOverrideReason) {
        await queryRunner.addColumn(
          "email_threads",
          new TableColumn({
            name: "urgencyOverrideReason",
            type: "text",
            isNullable: true,
          }),
        );
      }

      // Add index on urgencyScore
      const hasIndex = emailThreadsTable.indices.find(
        (idx) =>
          idx.columnNames.length === 2 &&
          idx.columnNames.includes("userId") &&
          idx.columnNames.includes("urgencyScore"),
      );
      if (!hasIndex) {
        await queryRunner.createIndex(
          "email_threads",
          new TableIndex({
            name: "IDX_email_threads_userId_urgencyScore",
            columnNames: ["userId", "urgencyScore"],
          }),
        );
      }
    }

    // Migrate existing isUrgent=true emails to urgencyScore=90 on their threads
    await queryRunner.query(`
            UPDATE email_threads
            SET "urgencyScore" = 90
            WHERE id IN (
                SELECT DISTINCT e."emailThreadId"
                FROM emails e
                WHERE e."isUrgent" = true
                AND e."emailThreadId" IS NOT NULL
            )
        `);

    // Remove isUrgent column from emails table
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasIsUrgent = emailsTable.findColumnByName("isUrgent");
      if (hasIsUrgent) {
        await queryRunner.dropColumn("emails", "isUrgent");
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add isUrgent back to emails
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasIsUrgent = emailsTable.findColumnByName("isUrgent");
      if (!hasIsUrgent) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "isUrgent",
            type: "boolean",
            default: false,
          }),
        );
      }
    }

    // Migrate urgencyScore >= 90 back to isUrgent=true
    await queryRunner.query(`
            UPDATE emails
            SET "isUrgent" = true
            WHERE "emailThreadId" IN (
                SELECT id
                FROM email_threads
                WHERE "urgencyScore" >= 90
            )
        `);

    // Remove urgency fields from email_threads
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    if (emailThreadsTable) {
      // Drop index first
      const hasIndex = emailThreadsTable.indices.find(
        (idx) => idx.name === "IDX_email_threads_userId_urgencyScore",
      );
      if (hasIndex) {
        await queryRunner.dropIndex(
          "email_threads",
          "IDX_email_threads_userId_urgencyScore",
        );
      }

      const hasUrgencyOverrideReason = emailThreadsTable.findColumnByName(
        "urgencyOverrideReason",
      );
      if (hasUrgencyOverrideReason) {
        await queryRunner.dropColumn("email_threads", "urgencyOverrideReason");
      }

      const hasUrgencyExplanation =
        emailThreadsTable.findColumnByName("urgencyExplanation");
      if (hasUrgencyExplanation) {
        await queryRunner.dropColumn("email_threads", "urgencyExplanation");
      }

      const hasUrgencyScore =
        emailThreadsTable.findColumnByName("urgencyScore");
      if (hasUrgencyScore) {
        await queryRunner.dropColumn("email_threads", "urgencyScore");
      }
    }
  }
}
