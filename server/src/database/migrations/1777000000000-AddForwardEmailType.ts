import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: AddForwardEmailType
 *
 * The `emailType` column in `scheduled_emails` is a varchar(20) — NOT a Postgres ENUM.
 * No ALTER TYPE is needed; we simply update the column comment to document the new
 * allowed value and extend the length comment. Existing "reply" and "new" rows are
 * unaffected. New scheduled forwards will be stored as "forward".
 */
export class AddForwardEmailType1777000000000 implements MigrationInterface {
  name = "AddForwardEmailType1777000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update column comment to reflect new allowed value.
    // The column is varchar(20), so no schema change is required —
    // "forward" fits within the 20-character limit.
    await queryRunner.query(
      `COMMENT ON COLUMN "scheduled_emails"."emailType" IS 'Type: reply, forward, or new'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert comment. Any existing "forward" rows would need to be manually
    // migrated before rolling back application code.
    await queryRunner.query(
      `COMMENT ON COLUMN "scheduled_emails"."emailType" IS 'Type: reply or new'`,
    );
  }
}
