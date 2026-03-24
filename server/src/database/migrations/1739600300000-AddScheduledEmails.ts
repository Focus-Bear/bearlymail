import { MigrationInterface, QueryRunner } from "typeorm";

export class AddScheduledEmails1739600300000 implements MigrationInterface {
  name = "AddScheduledEmails1739600300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "scheduled_emails" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "emailType" character varying(20) NOT NULL,
        "threadId" uuid,
        "emailId" uuid,
        "to" jsonb NOT NULL,
        "cc" jsonb,
        "bcc" jsonb,
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "attachments" jsonb,
        "scheduledSendAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "errorMessage" text,
        "userTimezone" text,
        "expectedReplyHours" integer,
        "forwardAttachmentIds" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scheduled_emails" PRIMARY KEY ("id")
      );
      COMMENT ON COLUMN "scheduled_emails"."status" IS 'Status: pending, sent, cancelled, failed';
      COMMENT ON COLUMN "scheduled_emails"."emailType" IS 'Type: reply or new';
      COMMENT ON COLUMN "scheduled_emails"."threadId" IS 'Thread ID if this is a reply';
      COMMENT ON COLUMN "scheduled_emails"."emailId" IS 'Email ID if this is a reply';
      COMMENT ON COLUMN "scheduled_emails"."to" IS 'To recipients';
      COMMENT ON COLUMN "scheduled_emails"."cc" IS 'CC recipients';
      COMMENT ON COLUMN "scheduled_emails"."bcc" IS 'BCC recipients';
      COMMENT ON COLUMN "scheduled_emails"."subject" IS 'Email subject';
      COMMENT ON COLUMN "scheduled_emails"."body" IS 'Email body (plain text or HTML)';
      COMMENT ON COLUMN "scheduled_emails"."attachments" IS 'Attachments (base64 encoded)';
      COMMENT ON COLUMN "scheduled_emails"."scheduledSendAt" IS 'When to send the email';
      COMMENT ON COLUMN "scheduled_emails"."sentAt" IS 'When the email was actually sent';
      COMMENT ON COLUMN "scheduled_emails"."errorMessage" IS 'Error message if sending failed';
      COMMENT ON COLUMN "scheduled_emails"."userTimezone" IS 'User''s timezone for display purposes';
      COMMENT ON COLUMN "scheduled_emails"."expectedReplyHours" IS 'Expected reply time in hours (for follow-up tracking)';
      COMMENT ON COLUMN "scheduled_emails"."forwardAttachmentIds" IS 'Forward attachment IDs if this is a reply with forwarded attachments';
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_scheduled_emails_userId_scheduledSendAt"
      ON "scheduled_emails" ("userId", "scheduledSendAt");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_scheduled_emails_scheduledSendAt_status"
      ON "scheduled_emails" ("scheduledSendAt", "status");
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ADD CONSTRAINT "FK_scheduled_emails_user"
      FOREIGN KEY ("userId")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduled_emails" DROP CONSTRAINT "FK_scheduled_emails_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_scheduled_emails_scheduledSendAt_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_scheduled_emails_userId_scheduledSendAt"`,
    );
    await queryRunner.query(`DROP TABLE "scheduled_emails"`);
  }
}
