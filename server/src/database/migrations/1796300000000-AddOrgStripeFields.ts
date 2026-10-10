import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrgStripeFields1796300000000 implements MigrationInterface {
  name = "AddOrgStripeFields1796300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "stripeCustomerId" varchar NULL,
        ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" varchar NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP COLUMN IF EXISTS "stripeCustomerId",
        DROP COLUMN IF EXISTS "stripeSubscriptionId"
    `);
  }
}
