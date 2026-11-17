import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Clears "delivered early" from threads that were never held in a batch.
 *
 * applyEmergencyDelivery used to flag any unstarred thread the priority
 * scorer rated urgent, including threads the first import had put straight in
 * the inbox — so week-old imported mail read "Urgent – delivered early". The
 * helper now requires a held batch; this undoes the flags it already wrote.
 *
 * The old state isn't recorded, so imported threads are recognised by every
 * one of their emails predating the thread row by more than the grace
 * window: a thread can only be batched (and so delivered early) by a sync
 * that saw a newly arriving email, which lands close to the thread's creation
 * or after it. The grace window covers sync lag for genuinely new mail.
 */
const IMPORT_GRACE_WINDOW = "24 hours";

export class ClearDeliveredEarlyOnImportedThreads1797850000000 implements MigrationInterface {
  name = "ClearDeliveredEarlyOnImportedThreads1797850000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "email_threads" thread
      SET "wasDeliveredEarly" = false
      WHERE thread."wasDeliveredEarly" = true
        AND NOT EXISTS (
          SELECT 1 FROM "emails" email
          WHERE email."emailThreadId" = thread."id"
            AND email."receivedAt" >= thread."createdAt" - INTERVAL '${IMPORT_GRACE_WINDOW}'
        )
    `);
  }

  async down(): Promise<void> {
    // Irreversible data fix: the cleared flags were wrong, so there is nothing
    // to restore.
  }
}
