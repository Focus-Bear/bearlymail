import { MigrationInterface, QueryRunner } from "typeorm";

// Snapshot values, not imports: a migration must keep doing what it did when it
// shipped, even after the tier constants change.
const STARTER_TIER = "bearlymail_starter";
const ENTERPRISE_TIER = "bearlymail_enterprise";
const ENTERPRISE_SEATS = 5;
const ACTIVE_PLAN = "active";

/**
 * Plan pricing v2 (Starter $5, Growth $15 with email tracking, Enterprise $40
 * with 5 team members).
 *
 * - Adds `organizations.grandfatheredEmailTracking`. Email tracking is now a
 *   Growth/Enterprise feature, but every org active on Starter today signed up
 *   at the old $15 price when tracking was included, so they keep it.
 * - Gives orgs already active on Enterprise the 5 seats the plan now includes.
 *   GREATEST never takes seats away from an org that already has more.
 */
export class AddPlanFeatureEntitlements1797000000000 implements MigrationInterface {
  name = "AddPlanFeatureEntitlements1797000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "grandfatheredEmailTracking" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "organizations" SET "grandfatheredEmailTracking" = true WHERE "planStatus" = $1 AND "volumeTierProductId" = $2`,
      [ACTIVE_PLAN, STARTER_TIER],
    );
    await queryRunner.query(
      `UPDATE "organizations" SET "maxSeats" = GREATEST("maxSeats", $1) WHERE "planStatus" = $2 AND "volumeTierProductId" = $3`,
      [ENTERPRISE_SEATS, ACTIVE_PLAN, ENTERPRISE_TIER],
    );
  }

  // The seat backfill is not reverted: there is no record of each org's
  // previous seat count, and removing seats could lock members out.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN IF EXISTS "grandfatheredEmailTracking"`,
    );
  }
}
