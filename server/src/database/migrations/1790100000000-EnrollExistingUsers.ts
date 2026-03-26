import { MigrationInterface, QueryRunner } from "typeorm";

export class EnrollExistingUsers1790100000000 implements MigrationInterface {
  name = "EnrollExistingUsers1790100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET "subscriptionStatus" = 'active',
          "subscriptionExpiresAt" = NOW() + INTERVAL '30 days'
      WHERE "subscriptionStatus" IS NULL
         OR "subscriptionStatus" = ''
         OR "subscriptionStatus" = 'none'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op: reverting user subscription status is not safe
    // without preserving original values. This migration is a one-way operation.
  }
}
