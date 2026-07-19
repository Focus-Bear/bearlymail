import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoResponderTables1769000000000 implements MigrationInterface {
  name = "AddAutoResponderTables1769000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum for auto response log priority
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "auto_response_log_priority_enum" AS ENUM ('low', 'medium', 'high');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create enum for suppression reason
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "suppression_reason_enum" AS ENUM ('opt_out', 'cooldown', 'bounce', 'manual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add autoResponderSettings column to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "autoResponderSettings" text
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."autoResponderSettings" IS 'Auto-responder configuration settings'
    `);

    // Create auto_response_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_response_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "emailThreadId" uuid,
        "senderEmailHash" varchar NOT NULL,
        "priorityLevel" "auto_response_log_priority_enum" NOT NULL DEFAULT 'medium',
        "qaAnswerProvided" boolean NOT NULL DEFAULT false,
        "confidenceScore" float,
        "templateUsed" varchar NOT NULL,
        "responseSubject" text,
        "responseBody" text,
        "classificationDetails" text,
        "escalationRequested" boolean NOT NULL DEFAULT false,
        "escalationRequestedAt" timestamp,
        "sentAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auto_response_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auto_response_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_auto_response_logs_thread" FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for auto_response_logs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_response_logs_userId_sentAt" 
      ON "auto_response_logs" ("userId", "sentAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_response_logs_userId_emailThreadId" 
      ON "auto_response_logs" ("userId", "emailThreadId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_response_logs_userId_senderEmailHash" 
      ON "auto_response_logs" ("userId", "senderEmailHash")
    `);

    // Add comments for auto_response_logs columns
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."senderEmailHash" IS 'SHA-256 hash of sender email for querying'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."confidenceScore" IS 'Confidence score of the Q&A answer (0-1)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."templateUsed" IS 'Template type used (standard, highPriority, lowPriority, zeroBacklog)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."responseSubject" IS 'The subject line used in the auto-response'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."responseBody" IS 'The body of the auto-response sent'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."classificationDetails" IS 'Classification details for debugging'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."escalationRequested" IS 'Whether the sender replied requesting escalation'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_logs"."escalationRequestedAt" IS 'When escalation was requested'
    `);

    // Create auto_response_suppressions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_response_suppressions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "senderEmailHash" varchar NOT NULL,
        "reason" "suppression_reason_enum" NOT NULL DEFAULT 'cooldown',
        "suppressUntil" timestamp,
        "notes" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auto_response_suppressions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auto_response_suppressions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for auto_response_suppressions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_response_suppressions_userId_senderEmailHash" 
      ON "auto_response_suppressions" ("userId", "senderEmailHash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_response_suppressions_userId_suppressUntil" 
      ON "auto_response_suppressions" ("userId", "suppressUntil")
    `);

    // Add comments for auto_response_suppressions columns
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_suppressions"."senderEmailHash" IS 'SHA-256 hash of sender email for querying'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_suppressions"."suppressUntil" IS 'When suppression expires (null = permanent for opt-outs)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "auto_response_suppressions"."notes" IS 'Additional notes about the suppression'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auto_response_suppressions_userId_suppressUntil"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auto_response_suppressions_userId_senderEmailHash"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auto_response_logs_userId_senderEmailHash"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auto_response_logs_userId_emailThreadId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auto_response_logs_userId_sentAt"
    `);

    // Drop tables
    await queryRunner.query(
      `DROP TABLE IF EXISTS "auto_response_suppressions"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_response_logs"`);

    // Drop column from users
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "autoResponderSettings"
    `);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "suppression_reason_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "auto_response_log_priority_enum"`,
    );
  }
}
