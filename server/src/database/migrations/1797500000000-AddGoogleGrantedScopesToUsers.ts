import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.googleGrantedScopes`: the scopes Google reported at the last
 * Google sign-in. Its granular consent screen lets a user untick Calendar or
 * Contacts (or Gmail) and still finish, so GET /users/me derives the missing
 * permissions from it and onboarding warns with a button to grant them.
 */
export class AddGoogleGrantedScopesToUsers1797500000000 implements MigrationInterface {
  name = "AddGoogleGrantedScopesToUsers1797500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "googleGrantedScopes" text
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."googleGrantedScopes" IS 'Space-separated OAuth scopes Google reported at the last Google sign-in; null when unknown. Drives the onboarding missing-permissions warning.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "googleGrantedScopes"
    `);
  }
}
