import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stores how an email can be unsubscribed from (List-Unsubscribe /
 * List-Unsubscribe-Post headers, or a body link) so the Triage card can offer
 * "Unsubscribe" without loading the body. The URLs carry per-recipient tokens,
 * so the column is encrypted like the other per-email JSON columns.
 */
export class AddUnsubscribeOptionsToEmails1798400000000 implements MigrationInterface {
  name = "AddUnsubscribeOptionsToEmails1798400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "unsubscribeOptions" text NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "emails"."unsubscribeOptions" IS 'Encrypted JSON {httpsUrl?, mailto?, oneClick, source} from the List-Unsubscribe / List-Unsubscribe-Post headers, or an https unsubscribe link found in the body. NULL when the email offers no way to unsubscribe.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "unsubscribeOptions"`,
    );
  }
}
