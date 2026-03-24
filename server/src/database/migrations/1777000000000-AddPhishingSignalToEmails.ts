import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhishingSignalToEmails1777000000000 implements MigrationInterface {
  name = "AddPhishingSignalToEmails1777000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "phishingConfidence" varchar NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "emails"."phishingConfidence" IS 'Phishing detection confidence level: low, medium, or high. NULL means not detected.'`,
    );

    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "phishingReason" text NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "emails"."phishingReason" IS 'Human-readable reason for the phishing signal'`,
    );

    // Index for fast phishing inbox filtering
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_userId_phishingConfidence"
       ON "emails" ("userId", "phishingConfidence")
       WHERE "phishingConfidence" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emails_userId_phishingConfidence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "phishingReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "phishingConfidence"`,
    );
  }
}
