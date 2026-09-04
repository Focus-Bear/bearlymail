import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `sanityCheck` to category_rules: the encrypted JSON outcome of the
 * strong-model review an auto-generated composite rule passed before it was
 * persisted ({ verdict, confidence, reason, model, checkedAt, revised }). NULL
 * for hand-authored rules, rules created before the review existed, and rules
 * created while the review was unavailable.
 */
export class AddSanityCheckToCategoryRules1796600000000
  implements MigrationInterface
{
  name = "AddSanityCheckToCategoryRules1796600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_rules" ADD COLUMN IF NOT EXISTS "sanityCheck" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_rules" DROP COLUMN IF EXISTS "sanityCheck"`,
    );
  }
}
