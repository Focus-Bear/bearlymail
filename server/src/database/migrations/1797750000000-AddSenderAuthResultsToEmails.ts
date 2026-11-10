import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stores the SPF/DKIM/DMARC outcomes from the receiving server's
 * Authentication-Results header so the phishing check can see failed sender
 * authentication. Only pass/fail outcomes are kept — no addresses — so the
 * column is not encrypted.
 */
export class AddSenderAuthResultsToEmails1797750000000 implements MigrationInterface {
  name = "AddSenderAuthResultsToEmails1797750000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "senderAuthResults" jsonb NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "emails"."senderAuthResults" IS 'SPF/DKIM/DMARC outcomes from the receiving server''s Authentication-Results header, e.g. {"spf":"pass","dmarc":"fail"}. NULL when the provider exposes no such header.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "senderAuthResults"`,
    );
  }
}
