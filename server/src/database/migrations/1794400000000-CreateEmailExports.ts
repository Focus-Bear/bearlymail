import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmailExports1794400000000 implements MigrationInterface {
  name = "CreateEmailExports1794400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."email_exports_status_enum" AS ENUM('pending', 'running', 'completed', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_exports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" "public"."email_exports_status_enum" NOT NULL DEFAULT 'pending',
        "s3Key" text,
        "fileSize" integer,
        "emailCount" integer,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "errorMessage" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_exports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_exports_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_exports_userId_status" ON "email_exports" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_exports_userId_createdAt" ON "email_exports" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_exports_userId_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_exports_userId_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "email_exports"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."email_exports_status_enum"`,
    );
  }
}
