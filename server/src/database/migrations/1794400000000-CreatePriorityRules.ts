import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `priority_rules` table for deterministic, learned priority rules
 * (issue: deterministic priority rules). A rule carries a composite-spec
 * matcher (same shape as `category_rules.compositeSpec`) plus the band it
 * assigns and the consistency stats it was mined from.
 *
 * SCHEMA ONLY. `compositeSpec` is encrypted at rest via the TypeORM
 * `encryptedJsonTransformer`; the migration writes no rows, so no encryption
 * secrets are needed here.
 */
export class CreatePriorityRules1794400000000 implements MigrationInterface {
  name = "CreatePriorityRules1794400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "priority_rules_band_enum" AS ENUM
          ('urgent', 'high', 'medium', 'low', 'very_low');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "priority_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "compositeSpec" text NOT NULL,
        "band" "priority_rules_band_enum" NOT NULL,
        "representativeScore" integer NOT NULL,
        "sampleCount" integer NOT NULL DEFAULT 0,
        "dominantBandShare" double precision NOT NULL DEFAULT 0,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "hitCount" integer NOT NULL DEFAULT 0,
        "lastValidatedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_priority_rules" PRIMARY KEY ("id"),
        CONSTRAINT "fk_priority_rules_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_priority_rules_user_enabled"
        ON "priority_rules" ("userId", "isEnabled")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_priority_rules_user_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "priority_rules"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "priority_rules_band_enum"`);
  }
}
