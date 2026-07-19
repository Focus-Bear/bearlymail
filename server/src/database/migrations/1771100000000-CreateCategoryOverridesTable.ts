import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCategoryOverridesTable1771100000000 implements MigrationInterface {
  name = "CreateCategoryOverridesTable1771100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "category_overrides" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "emailThreadId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "originalCategory" varchar(100),
        "userCategory" varchar(100) NOT NULL,
        "reasonText" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_overrides" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_overrides_userId_emailThreadId" 
      ON "category_overrides" ("userId", "emailThreadId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_overrides_emailThreadId" 
      ON "category_overrides" ("emailThreadId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_overrides_userId_createdAt" 
      ON "category_overrides" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "category_overrides" 
      ADD CONSTRAINT "FK_category_overrides_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "category_overrides" 
      ADD CONSTRAINT "FK_category_overrides_emailThreadId" 
      FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_overrides" DROP CONSTRAINT "FK_category_overrides_emailThreadId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_overrides" DROP CONSTRAINT "FK_category_overrides_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_category_overrides_userId_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_category_overrides_emailThreadId"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_category_overrides_userId_emailThreadId"`,
    );
    await queryRunner.query(`DROP TABLE "category_overrides"`);
  }
}
