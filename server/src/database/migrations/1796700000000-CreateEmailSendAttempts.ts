import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: create `email_send_attempts`.
 *
 * Backing store for the background email-send pipeline. The send endpoints
 * persist one row per outbound message before enqueueing the pg-boss job and
 * return its id as the correlation id, so nothing is lost if a worker dies
 * between the HTTP response and the provider call. The row doubles as the
 * idempotency key: the processor claims it with a conditional
 * `queued -> sending` update, so a retried job cannot send twice.
 *
 * `payload` is an encrypted JSON blob (recipients, subject, body, base64
 * attachments) written through the same column transformer as the rest of the
 * email data at rest.
 */
export class CreateEmailSendAttempts1796700000000 implements MigrationInterface {
  name = "CreateEmailSendAttempts1796700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_send_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'queued',
        "sendType" character varying(10) NOT NULL,
        "emailId" uuid,
        "payload" text NOT NULL,
        "messageId" text,
        "threadId" text,
        "attempts" integer NOT NULL DEFAULT 0,
        "failureReason" character varying(40),
        "errorDetail" text,
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_send_attempts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "email_send_attempts"
      DROP CONSTRAINT IF EXISTS "FK_email_send_attempts_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "email_send_attempts"
      ADD CONSTRAINT "FK_email_send_attempts_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_send_attempts_user_status" ON "email_send_attempts" ("userId", "status")`,
    );
    // Drives the stalled-send sweeper, which scans by state and staleness.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_send_attempts_status_updated" ON "email_send_attempts" ("status", "updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_send_attempts_status_updated"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_send_attempts_user_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "email_send_attempts"`);
  }
}
