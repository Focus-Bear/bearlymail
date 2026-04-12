import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCategoryRules1790500000000 implements MigrationInterface {
  name = "CreateCategoryRules1790500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      CREATE TYPE "category_rule_type_enum" AS ENUM (
        'exact_sender',
        'sender_domain',
        'subject_prefix',
        'sender_domain_and_subject_prefix'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "category_rules" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        uuid NOT NULL,
        "categoryName"  text NOT NULL,
        "ruleType"      "category_rule_type_enum" NOT NULL,
        "pattern"       text NOT NULL,
        "patternHash"   varchar NOT NULL,
        "subjectPrefix" text NULL,
        "isEnabled"     boolean NOT NULL DEFAULT true,
        "hitCount"      integer NOT NULL DEFAULT 0,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_rules" PRIMARY KEY ("id")
      );
    `);

    // Fast lookup by user
    await queryRunner.query(`
      CREATE INDEX "IDX_category_rules_userId_isEnabled"
        ON "category_rules" ("userId", "isEnabled");
    `);

    // Deduplication — unique per user + type + pattern
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_category_rules_userId_type_patternHash"
        ON "category_rules" ("userId", "ruleType", "patternHash");
    `);

    // Foreign key to users
    await queryRunner.query(`
      ALTER TABLE "category_rules"
        ADD CONSTRAINT "FK_category_rules_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_rules" DROP CONSTRAINT IF EXISTS "FK_category_rules_userId";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_category_rules_userId_type_patternHash";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_category_rules_userId_isEnabled";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "category_rules";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "category_rule_type_enum";`);
  }
}
