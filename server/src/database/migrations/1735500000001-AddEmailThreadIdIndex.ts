import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance fix: Add index on emailThreadId for faster inbox queries.
 * 
 * The getInbox query does:
 *   WHERE email."emailThreadId" IN (...threadIds) AND userId = :userId
 * 
 * Without an index on emailThreadId, this requires a full table scan.
 */
export class AddEmailThreadIdIndex1735500000001 implements MigrationInterface {
  name = 'AddEmailThreadIdIndex1735500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use IF NOT EXISTS to make migration idempotent
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_userId_emailThreadId" 
      ON "emails" ("userId", "emailThreadId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_emailThreadId" 
      ON "emails" ("emailThreadId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_userId_emailThreadId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_emailThreadId"`);
  }
}

