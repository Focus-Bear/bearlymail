import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompositeCategoryRules1790600000000 implements MigrationInterface {
  name = "AddCompositeCategoryRules1790600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "category_rule_kind_enum" AS ENUM ('legacy', 'composite');
    `);

    await queryRunner.query(`
      ALTER TABLE "category_rules"
        ADD COLUMN "ruleKind" "category_rule_kind_enum" NOT NULL DEFAULT 'legacy';
    `);

    await queryRunner.query(`
      ALTER TABLE "category_rules"
        ADD COLUMN "compositeSpec" text NULL;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_category_rules_userId_type_patternHash";
    `);

    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "ruleType" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "pattern" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "patternHash" DROP NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_category_rules_legacy_user_type_hash"
        ON "category_rules" ("userId", "ruleType", "patternHash")
        WHERE "ruleKind" = 'legacy';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "category_rules" WHERE "ruleKind" = 'composite';
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_category_rules_legacy_user_type_hash";
    `);

    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "patternHash" SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "pattern" SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "category_rules" ALTER COLUMN "ruleType" SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "category_rules" DROP COLUMN IF EXISTS "compositeSpec";
    `);
    await queryRunner.query(`
      ALTER TABLE "category_rules" DROP COLUMN IF EXISTS "ruleKind";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "category_rule_kind_enum";
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_category_rules_userId_type_patternHash"
        ON "category_rules" ("userId", "ruleType", "patternHash");
    `);
  }
}
