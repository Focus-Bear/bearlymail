import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddAttachmentsToEmails1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add attachments column to emails table
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasAttachments = emailsTable.findColumnByName("attachments");
      if (!hasAttachments) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "attachments",
            type: "text",
            isNullable: true,
            comment:
              "JSON array of attachment metadata: {attachmentId, filename, mimeType, size}[]",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasAttachments = emailsTable.findColumnByName("attachments");
      if (hasAttachments) {
        await queryRunner.dropColumn("emails", "attachments");
      }
    }
  }
}
