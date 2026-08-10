import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Removes the waitlist/approval gate: backfills every existing user to
 * isApproved = true so no one is stranded once direct sign-up is enabled, and
 * flips the column default to true so newly-created accounts are active by
 * default. The column is retained (not dropped) for legacy/admin use.
 */
export class ApproveAllUsersRemoveWaitlistGate1795900000000
  implements MigrationInterface
{
  name = "ApproveAllUsersRemoveWaitlistGate1795900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET "isApproved" = true WHERE "isApproved" = false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "isApproved" SET DEFAULT true`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."isApproved" IS 'Whether the account is active. Direct sign-up approves on creation; kept for legacy/admin use (no longer a waitlist gate).'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the previous column default. The row-level backfill is
    // intentionally NOT reverted — we cannot know which users were unapproved
    // before this ran, and re-disapproving active users would lock them out.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "isApproved" SET DEFAULT false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."isApproved" IS 'Approved from waitlist'`,
    );
  }
}
