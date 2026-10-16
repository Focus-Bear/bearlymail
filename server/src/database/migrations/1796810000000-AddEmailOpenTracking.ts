import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Mailtrack-style email open tracking.
 *
 * - `email_trackings`: one row per user-originated send (tracked or not), with
 *   the unguessable pixel token and denormalised open aggregates so the public
 *   pixel hit is a single UPDATE.
 * - `email_open_events`: individual counted opens (encrypted IP / user agent).
 * - `users.trackEmailOpens`: the per-user setting, on by default.
 * - `scheduled_emails.trackOpens`: the composer's per-message choice, carried
 *   until the scheduled send fires.
 */
export class AddEmailOpenTracking1796810000000 implements MigrationInterface {
  name = "AddEmailOpenTracking1796810000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "trackEmailOpens" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."trackEmailOpens" IS 'Mailtrack-style open tracking: embed a pixel in the user''s outgoing HTML mail. On by default; toggled in Settings.'
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ADD COLUMN IF NOT EXISTS "trackOpens" boolean
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "scheduled_emails"."trackOpens" IS 'Per-message open-tracking choice from the composer; null defers to users.trackEmailOpens'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_trackings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "token" character varying(32),
        "status" character varying(20) NOT NULL,
        "untrackedReason" character varying(30),
        "source" character varying(20) NOT NULL,
        "messageId" text,
        "threadId" text,
        "recipients" text,
        "recipientCount" integer NOT NULL DEFAULT 0,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "openCount" integer NOT NULL DEFAULT 0,
        "firstOpenedAt" TIMESTAMP WITH TIME ZONE,
        "lastOpenedAt" TIMESTAMP WITH TIME ZONE,
        "automaticOpenCount" integer NOT NULL DEFAULT 0,
        "lastAutomaticOpenAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_trackings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_trackings_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_trackings_token" ON "email_trackings" ("token")`,
    );
    // Stats aggregate per user over a sent-at window.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_trackings_user_sent" ON "email_trackings" ("userId", "sentAt")`,
    );
    // Follow-up list and thread view look summaries up by thread / message.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_trackings_user_thread" ON "email_trackings" ("userId", "threadId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_trackings_user_message" ON "email_trackings" ("userId", "messageId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_open_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "trackingId" uuid NOT NULL,
        "openedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "openSource" character varying(30) NOT NULL,
        "isLikelyAutomatic" boolean NOT NULL DEFAULT false,
        "ipAddress" text,
        "userAgent" text,
        CONSTRAINT "PK_email_open_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_open_events_tracking" FOREIGN KEY ("trackingId")
          REFERENCES "email_trackings"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_open_events_tracking_opened" ON "email_open_events" ("trackingId", "openedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_open_events_tracking_opened"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "email_open_events"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_trackings_user_message"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_trackings_user_thread"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_trackings_user_sent"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_trackings_token"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_trackings"`);
    await queryRunner.query(
      `ALTER TABLE "scheduled_emails" DROP COLUMN IF EXISTS "trackOpens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "trackEmailOpens"`,
    );
  }
}
