import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const TABLE = "reply_drafts";
const COLUMN = "source";

/**
 * Records who last wrote a reply draft, so the inbox can flag threads where the
 * auto-responder saved a draft the user hasn't seen. Existing drafts were all
 * written by users.
 */
export class AddSourceToReplyDrafts1797950000000 implements MigrationInterface {
  name = "AddSourceToReplyDrafts1797950000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(TABLE);
    if (table?.findColumnByName(COLUMN)) {
      return;
    }
    await queryRunner.addColumn(
      TABLE,
      new TableColumn({
        name: COLUMN,
        type: "varchar",
        length: "20",
        default: "'user'",
        isNullable: false,
        comment: "Who last wrote the draft: user or auto_responder",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(TABLE);
    if (table?.findColumnByName(COLUMN)) {
      await queryRunner.dropColumn(TABLE, COLUMN);
    }
  }
}
