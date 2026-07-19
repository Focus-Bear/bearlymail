import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSentByAutoResponderToEmails1781000000000 implements MigrationInterface {
  name = "AddSentByAutoResponderToEmails1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "emails",
      new TableColumn({
        name: "sentByAutoResponder",
        type: "boolean",
        default: false,
        isNullable: false,
        comment:
          "True when this email was sent by the BearlyMail autoresponder. " +
          "Set at send time so checkThreadFollowUpStatus can identify autoresponder " +
          "replies without fragile timestamp cross-referencing.",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("emails", "sentByAutoResponder");
  }
}
