import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * scheduled_emails.threadId was originally created as uuid, but it stores the
 * email provider's thread ID (e.g. Gmail's 16-char hex like "19e234945840421a",
 * Office365's long base64-ish strings, Zoho's numeric strings) — none of which
 * are UUIDs. Every scheduled-send insert was failing with
 *   QueryFailedError: invalid input syntax for type uuid: "..."
 * See issue #2074.
 */
export class FixScheduledEmailsThreadIdType1793700000000
  implements MigrationInterface
{
  name = "FixScheduledEmailsThreadIdType1793700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduled_emails" ALTER COLUMN "threadId" TYPE varchar USING "threadId"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Provider thread IDs (Gmail/Office365/Zoho) are not valid UUIDs, so a
    // direct cast would throw. Null them out first — reverting this migration
    // is inherently lossy for any row written after `up` ran.
    await queryRunner.query(
      `UPDATE "scheduled_emails" SET "threadId" = NULL WHERE "threadId" !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduled_emails" ALTER COLUMN "threadId" TYPE uuid USING "threadId"::uuid`,
    );
  }
}
