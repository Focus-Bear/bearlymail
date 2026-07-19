import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the org plan-status lifecycle columns and backfills existing rows.
 *
 * - planStatus: 'unpaid' | 'trial' | 'active' | 'expired' (default 'unpaid')
 * - trialEndsAt: when the free trial ends (only meaningful while on trial)
 *
 * Backfill:
 * - Orgs with a paid volume tier (volumeTierProductId set) become 'active'.
 * - All other existing orgs become 'expired' on the free-tier email limit
 *   (100/cycle) immediately — no retroactive trial. Only newly created orgs
 *   get the 7-day trial (see OrganizationsService).
 */
export class AddOrgPlanStatus1795400000000 implements MigrationInterface {
  name = "AddOrgPlanStatus1795400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "planStatus" character varying NOT NULL DEFAULT 'unpaid'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "organizations"."planStatus" IS 'Plan state: unpaid | trial | active | expired'`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "trialEndsAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "organizations"."trialEndsAt" IS 'When the free trial ends (meaningful while planStatus=''trial'')'`,
    );

    await queryRunner.query(
      `UPDATE "organizations"
       SET "planStatus" = 'active'
       WHERE "volumeTierProductId" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "organizations"
       SET "planStatus" = 'expired',
           "emailVolumeLimit" = 100,
           "trialEndsAt" = NULL
       WHERE "volumeTierProductId" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the pre-migration default allowance for the orgs this
    // migration downgraded, then drop the lifecycle columns.
    await queryRunner.query(
      `UPDATE "organizations"
       SET "emailVolumeLimit" = 3000
       WHERE "volumeTierProductId" IS NULL AND "emailVolumeLimit" = 100`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "trialEndsAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "planStatus"`,
    );
  }
}
