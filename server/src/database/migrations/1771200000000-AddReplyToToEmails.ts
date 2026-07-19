import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddReplyToToEmails1771200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasReplyTo = emailsTable.findColumnByName("replyTo");
      if (!hasReplyTo) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "replyTo",
            type: "text",
            isNullable: true,
            comment:
              "Reply-To header value - when present, replies should be sent to this address instead of From",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasReplyTo = emailsTable.findColumnByName("replyTo");
      if (hasReplyTo) {
        await queryRunner.dropColumn("emails", "replyTo");
      }
    }
  }
}
