import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Add HMAC fingerprint columns to the emails table for contact-thread lookup.
 *
 * Because `from`, `to`, and `cc` are AES-GCM encrypted with a random IV per
 * write they cannot be queried in SQL.  These companion columns store a
 * deterministic HMAC-SHA256 fingerprint of each address so the contacts
 * service can use an indexed WHERE clause instead of loading and decrypting
 * thousands of emails in memory.
 *
 * Existing rows will have NULL for both columns — the fallback in-memory scan
 * in getContactThreads handles this gracefully until rows are backfilled.
 */
export class AddEmailHmacColumns1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "senderEmailHmac" character varying`,
    );

    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "recipientEmailsHmac" text`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_userId_senderEmailHmac"
       ON "emails" ("userId", "senderEmailHmac")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emails_userId_senderEmailHmac"`,
    );

    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "recipientEmailsHmac"`,
    );

    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "senderEmailHmac"`,
    );
  }
}
