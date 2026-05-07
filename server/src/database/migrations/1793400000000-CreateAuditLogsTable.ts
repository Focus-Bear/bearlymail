import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * SAQ Q52 / GAP-12: tamper-evident audit trail of admin endpoint access.
 *
 * Append-only by application convention: AuditService exposes only a `log()`
 * method, with no update or delete paths. A future migration can layer a
 * Postgres trigger or revoke UPDATE/DELETE from the app role for stronger
 * tamper-evidence.
 */
export class CreateAuditLogsTable1793400000000 implements MigrationInterface {
  name = "CreateAuditLogsTable1793400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid,
        "action" text NOT NULL,
        "targetType" text,
        "targetId" text,
        "metadata" text,
        "ipAddress" text,
        "userAgent" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId_createdAt" ON "audit_logs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_createdAt" ON "audit_logs" ("action", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_action_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_userId_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
