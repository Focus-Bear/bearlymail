import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Backfill migration for senderContactId on the emails table.
 *
 * Context: 1782100000000-AddSenderContactId.ts added the column but emails
 * ingested before that migration ran have senderContactId = NULL even when a
 * matching contact already exists.  This migration joins emails → contacts on
 * (userId, senderEmailHmac = emailHash) and fills the gap in one pass.
 *
 * The UPDATE is safe to re-run: the WHERE clause guards on IS NULL so rows
 * that already have a contact ID are never touched.
 */
export class BackfillSenderContactId1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE emails em
      SET "senderContactId" = c.id
      FROM contacts c
      WHERE em."userId"            = c."userId"
        AND em."senderEmailHmac"   = c."emailHash"
        AND em."senderContactId"  IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversing a backfill would incorrectly null-out legitimate values —
    // intentionally left as a no-op.  To undo, restore from a backup.
  }
}
