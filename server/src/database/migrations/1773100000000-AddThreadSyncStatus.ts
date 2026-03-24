import { MigrationInterface, QueryRunner } from "typeorm";

export class AddThreadSyncStatus1773100000000 implements MigrationInterface {
  name = "AddThreadSyncStatus1773100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD "syncStatus" character varying NOT NULL DEFAULT 'synced'`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD "syncStatusUpdatedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_threads_user_sync_status" ON "email_threads" ("userId", "syncStatus", "syncStatusUpdatedAt")`,
    );

    await queryRunner.query(
      `UPDATE "email_threads"
       SET "syncStatus" = 'unsynced',
           "syncStatusUpdatedAt" = COALESCE("lastUserOperationAt", NOW())
       WHERE "lastUserOperationAt" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_threads_user_sync_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "syncStatusUpdatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "syncStatus"`,
    );
  }
}
