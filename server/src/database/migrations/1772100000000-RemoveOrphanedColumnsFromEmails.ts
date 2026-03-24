import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveOrphanedColumnsFromEmails1772100000000 implements MigrationInterface {
  name = "RemoveOrphanedColumnsFromEmails1772100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop orphaned columns from emails table that were moved to email_threads
    // or were never properly used

    // isProcessingPriority was moved to email_threads in migration 1767645300000
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP COLUMN IF EXISTS "isProcessingPriority"
    `);

    // priorityExplanation was moved to email_threads in migration 1767645300000
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP COLUMN IF EXISTS "priorityExplanation"
    `);

    // createdAt is not used - emails only need receivedAt
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP COLUMN IF EXISTS "createdAt"
    `);

    // updatedAt is not used - emails are immutable
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP COLUMN IF EXISTS "updatedAt"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore columns if migration is reverted
    // Note: Data will be lost as we don't preserve it

    await queryRunner.query(`
      ALTER TABLE "emails"
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "emails"
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "emails"
      ADD COLUMN IF NOT EXISTS "priorityExplanation" TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE "emails"
      ADD COLUMN IF NOT EXISTS "isProcessingPriority" BOOLEAN DEFAULT false
    `);
  }
}
