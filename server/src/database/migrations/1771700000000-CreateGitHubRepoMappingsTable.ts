import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGitHubRepoMappingsTable1771700000000 implements MigrationInterface {
  name = "CreateGitHubRepoMappingsTable1771700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "github_repo_mappings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "owner" text NOT NULL,
        "repo" text NOT NULL,
        "emailCategories" text,
        "context" text,
        "isAutoDiscovered" boolean NOT NULL DEFAULT false,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_github_repo_mappings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_github_repo_mappings_userId_owner_repo" 
      ON "github_repo_mappings" ("userId", "owner", "repo")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_github_repo_mappings_userId" 
      ON "github_repo_mappings" ("userId")
    `);

    await queryRunner.query(`
      ALTER TABLE "github_repo_mappings" 
      ADD CONSTRAINT "FK_github_repo_mappings_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "github_repo_mappings" DROP CONSTRAINT "FK_github_repo_mappings_userId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_github_repo_mappings_userId"`);
    await queryRunner.query(
      `DROP INDEX "IDX_github_repo_mappings_userId_owner_repo"`,
    );
    await queryRunner.query(`DROP TABLE "github_repo_mappings"`);
  }
}
