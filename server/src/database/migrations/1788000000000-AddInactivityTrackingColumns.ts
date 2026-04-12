import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInactivityTrackingColumns1788000000000 implements MigrationInterface {
  name = "AddInactivityTrackingColumns1788000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "lastActivityAt" TIMESTAMP NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_users_lastActivityAt" ON "users" ("lastActivityAt")`,
    );

    // Backfill from updatedAt as a reasonable approximation for existing users
    await queryRunner.query(
      `UPDATE "users" SET "lastActivityAt" = "updatedAt" WHERE "lastActivityAt" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN "aiProcessingDeferred" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "aiProcessingDeferred"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_users_lastActivityAt"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastActivityAt"`);
  }
}
