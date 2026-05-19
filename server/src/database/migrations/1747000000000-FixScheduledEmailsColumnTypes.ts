import { MigrationInterface, QueryRunner } from "typeorm";

export class FixScheduledEmailsColumnTypes1747000000000
  implements MigrationInterface
{
  name = "FixScheduledEmailsColumnTypes1747000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // threadId was created as uuid but holds provider thread IDs (Gmail hex strings,
    // Office365 conversation IDs, etc.) which are not UUID-formatted.
    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "threadId" TYPE text USING "threadId"::text
    `);

    // to/cc/bcc/attachments/forwardAttachmentIds were created as jsonb but store
    // AES-256-GCM encrypted strings, which are not valid JSON. Change to text to
    // match the pattern used by all other encrypted JSON columns in the codebase.
    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "to" TYPE text USING "to"::text
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "cc" TYPE text USING "cc"::text
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "bcc" TYPE text USING "bcc"::text
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "attachments" TYPE text USING "attachments"::text
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "forwardAttachmentIds" TYPE text USING "forwardAttachmentIds"::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NOTE: This rollback is best-effort and effectively one-way. The whole point
    // of the up migration is to permit data that violates the original column
    // types (non-UUID provider thread IDs, AES-256-GCM ciphertext in JSON columns).
    // If any such rows exist when this runs, the USING casts below will fail. In
    // that case, operators must delete or migrate the offending rows by hand
    // before retrying the rollback.
    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "forwardAttachmentIds" TYPE jsonb USING "forwardAttachmentIds"::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "attachments" TYPE jsonb USING "attachments"::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "bcc" TYPE jsonb USING "bcc"::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "cc" TYPE jsonb USING "cc"::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "to" TYPE jsonb USING "to"::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_emails"
      ALTER COLUMN "threadId" TYPE uuid USING "threadId"::uuid
    `);
  }
}
