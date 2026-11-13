import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Email verification, per-account login lockout, and hashed password
 * setup/reset tokens.
 *
 * Outstanding setup/reset tokens are hashed in place (SHA-256, hex — the
 * same digest the app now computes), so links already sent keep working
 * until they expire; the plaintext column is then dropped.
 */
export class AddEmailVerificationAndLoginLockout1797900000000 implements MigrationInterface {
  name = "AddEmailVerificationAndLoginLockout1797900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" character varying(64),
        ADD COLUMN IF NOT EXISTS "emailVerificationTokenExpiresAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "loginLockedUntil" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "passwordSetupTokenHash" character varying(64)
    `);
    await queryRunner.query(`
      UPDATE "users"
      SET "passwordSetupTokenHash" =
        encode(sha256(convert_to("passwordSetupToken", 'UTF8')), 'hex')
      WHERE "passwordSetupToken" IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordSetupToken"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_emailVerificationTokenHash" ON "users" ("emailVerificationTokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_passwordSetupTokenHash" ON "users" ("passwordSetupTokenHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Hashed tokens can't be turned back into links: outstanding setup/reset
    // links stop working after a revert and must be re-sent.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_passwordSetupTokenHash"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_emailVerificationTokenHash"`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "passwordSetupToken" character varying,
        DROP COLUMN IF EXISTS "passwordSetupTokenHash",
        DROP COLUMN IF EXISTS "loginLockedUntil",
        DROP COLUMN IF EXISTS "failedLoginAttempts",
        DROP COLUMN IF EXISTS "emailVerificationTokenExpiresAt",
        DROP COLUMN IF EXISTS "emailVerificationTokenHash",
        DROP COLUMN IF EXISTS "emailVerifiedAt"
    `);
  }
}
