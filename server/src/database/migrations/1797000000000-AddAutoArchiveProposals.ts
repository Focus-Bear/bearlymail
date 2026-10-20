import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Auto-archive proposals for heavy senders the user ignores.
 *
 * 1. Engagement signals that `isRead` alone cannot give (archiving marks mail
 *    read, and resets stars):
 *    - emails.openedAt            — first open in BearlyMail
 *    - emails.archivedAt          — when the USER archived/deleted it
 *    - emails.archivedWhileUnread — that archive happened unread and unopened
 *    - email_threads.firstStarredAt — first time the thread was starred
 *    All nullable / defaulted, so adding them rewrites no rows.
 * 2. `auto_archive_proposals` — proposed rules with their evidence (encrypted).
 * 3. `auto_archive_scan_states` — per-user incremental-run watermark.
 */
export class AddAutoArchiveProposals1797000000000 implements MigrationInterface {
  name = "AddAutoArchiveProposals1797000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD "openedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" ADD "archivedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" ADD "archivedWhileUnread" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD "firstStarredAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(`
      CREATE TABLE "auto_archive_proposals" (
        "id"               uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "userId"           uuid                     NOT NULL,
        "senderKey"        character varying(128)   NOT NULL,
        "memberSenderKeys" jsonb                    NOT NULL DEFAULT '[]',
        "scope"            character varying(16)    NOT NULL,
        "status"           character varying(16)    NOT NULL DEFAULT 'pending',
        "conditionKey"     character varying(128)   NOT NULL,
        "senderDisplay"    text                     NOT NULL,
        "condition"        text                     NOT NULL,
        "evidence"         text                     NOT NULL,
        "workflowRuleId"   uuid,
        "respondedAt"      TIMESTAMP WITH TIME ZONE,
        "createdAt"        TIMESTAMP                NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP                NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auto_archive_proposals" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auto_archive_proposals_user_condition"
          UNIQUE ("userId", "conditionKey"),
        CONSTRAINT "FK_auto_archive_proposals_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_auto_archive_proposals_user_status"
       ON "auto_archive_proposals" ("userId", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "auto_archive_scan_states" (
        "userId"         uuid                     NOT NULL,
        "lastScannedAt"  TIMESTAMP WITH TIME ZONE,
        "lastFullScanAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt"      TIMESTAMP                NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auto_archive_scan_states" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_auto_archive_scan_states_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_archive_scan_states"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_auto_archive_proposals_user_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_archive_proposals"`);
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "firstStarredAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN "archivedWhileUnread"`,
    );
    await queryRunner.query(`ALTER TABLE "emails" DROP COLUMN "archivedAt"`);
    await queryRunner.query(`ALTER TABLE "emails" DROP COLUMN "openedAt"`);
  }
}
