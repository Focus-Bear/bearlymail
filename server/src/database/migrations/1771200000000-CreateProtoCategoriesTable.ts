import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProtoCategoriesTable1771200000000 implements MigrationInterface {
  name = "CreateProtoCategoriesTable1771200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create proto_categories table
    await queryRunner.query(`
      CREATE TABLE "proto_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "emailCount" integer NOT NULL DEFAULT 1,
        "isPromoted" boolean NOT NULL DEFAULT false,
        "promotedCategoryId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_proto_categories" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key to users table
    await queryRunner.query(`
      ALTER TABLE "proto_categories" 
      ADD CONSTRAINT "FK_proto_categories_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Add index for querying by user and promotion status
    await queryRunner.query(`
      CREATE INDEX "IDX_proto_categories_userId_isPromoted" 
      ON "proto_categories" ("userId", "isPromoted")
    `);

    // Add unique index for user + name combination
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_proto_categories_userId_name" 
      ON "proto_categories" ("userId", "name")
    `);

    // Add protoCategoryId column to email_threads table
    await queryRunner.query(`
      ALTER TABLE "email_threads" 
      ADD COLUMN "protoCategoryId" uuid
    `);

    // Add foreign key for protoCategoryId
    await queryRunner.query(`
      ALTER TABLE "email_threads" 
      ADD CONSTRAINT "FK_email_threads_protoCategoryId" 
      FOREIGN KEY ("protoCategoryId") REFERENCES "proto_categories"("id") 
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Add index for querying threads by proto category
    await queryRunner.query(`
      CREATE INDEX "IDX_email_threads_protoCategoryId" 
      ON "email_threads" ("protoCategoryId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index on email_threads
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_email_threads_protoCategoryId"
    `);

    // Remove foreign key on email_threads
    await queryRunner.query(`
      ALTER TABLE "email_threads" 
      DROP CONSTRAINT IF EXISTS "FK_email_threads_protoCategoryId"
    `);

    // Remove protoCategoryId column from email_threads
    await queryRunner.query(`
      ALTER TABLE "email_threads" 
      DROP COLUMN IF EXISTS "protoCategoryId"
    `);

    // Remove indexes from proto_categories
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_proto_categories_userId_name"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_proto_categories_userId_isPromoted"
    `);

    // Remove foreign key from proto_categories
    await queryRunner.query(`
      ALTER TABLE "proto_categories" 
      DROP CONSTRAINT IF EXISTS "FK_proto_categories_userId"
    `);

    // Drop proto_categories table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "proto_categories"
    `);
  }
}
