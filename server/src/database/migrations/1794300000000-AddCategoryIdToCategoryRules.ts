import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the `categoryId` FK column to `category_rules` (issue: renaming a
 * category silently broke its linked rules because matching was keyed on the
 * encrypted display name).
 *
 * SCHEMA ONLY — no data backfill here. The backfill must decrypt each rule's
 * `categoryName` and each candidate `user_contexts.contextValue` to match them,
 * and under KMS envelope encryption those columns are encrypted with a
 * *per-user* data key resolved at request time via
 * `UserEncryptionService.withUserKey()`. The TypeORM migration CLI runs with
 * neither the per-user key NOR the global `ENCRYPTION_KEY` in scope (the
 * migration ECS task is deliberately not given any encryption secrets), so it
 * cannot decrypt and would orphan every rule.
 *
 * The backfill therefore runs in application context via
 * `CategoryRuleIdBackfillService` — triggered from the admin re-encryption UI
 * (POST /category-rules/admin/backfill-ids/start) — which wraps each user in
 * `withUserKey()` on the server/worker image (global key + KMS access). Same
 * split as the contact searchTokens backfill (#2030) and the email_threads
 * categoryId backfill. New rules created/updated after this migration set
 * `categoryId` directly, so the backfill only has to cover pre-existing rows.
 */
export class AddCategoryIdToCategoryRules1794300000000
  implements MigrationInterface
{
  name = "AddCategoryIdToCategoryRules1794300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_rules" ADD COLUMN IF NOT EXISTS "categoryId" uuid`,
    );

    await queryRunner.query(`
      ALTER TABLE "category_rules"
      ADD CONSTRAINT "fk_category_rules_category_id"
      FOREIGN KEY ("categoryId")
      REFERENCES "user_contexts"("contextId")
      ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_rules" DROP CONSTRAINT "fk_category_rules_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_rules" DROP COLUMN "categoryId"`,
    );
  }
}
