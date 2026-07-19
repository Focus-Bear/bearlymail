import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrgBillingFields1790000000000 implements MigrationInterface {
  name = "AddOrgBillingFields1790000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "maxSeats" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "revenueCatOrgSubscriptionId" varchar NULL,
        ADD COLUMN IF NOT EXISTS "volumeTierProductId" varchar NULL,
        ADD COLUMN IF NOT EXISTS "emailsUsedThisCycle" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "emailVolumeLimit" integer NOT NULL DEFAULT 3000,
        ADD COLUMN IF NOT EXISTS "billingCycleStart" timestamp NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP COLUMN IF EXISTS "maxSeats",
        DROP COLUMN IF EXISTS "revenueCatOrgSubscriptionId",
        DROP COLUMN IF EXISTS "volumeTierProductId",
        DROP COLUMN IF EXISTS "emailsUsedThisCycle",
        DROP COLUMN IF EXISTS "emailVolumeLimit",
        DROP COLUMN IF EXISTS "billingCycleStart"
    `);
  }
}
