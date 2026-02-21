import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSyncHistoryLogs1773000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sync_history_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMPTZ,
        "provider" VARCHAR(32) NOT NULL DEFAULT 'gmail',
        "syncWindowStart" TIMESTAMPTZ,
        "queries" jsonb,
        "threadsFound" integer,
        "durationMs" integer,
        "errorMessage" text,
        "isContinuation" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_sync_history_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sync_history_logs_userId_syncedAt"
      ON "sync_history_logs" ("userId", "syncedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_sync_history_logs_userId_syncedAt"`,
    );
    await queryRunner.query(`DROP TABLE "sync_history_logs"`);
  }
}
