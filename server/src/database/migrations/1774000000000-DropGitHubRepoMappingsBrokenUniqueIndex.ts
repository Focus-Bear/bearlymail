import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The original unique index on (userId, owner, repo) was ineffective because
 * owner and repo are encrypted with AES-256-GCM using a random IV per write.
 * Identical plaintext values produce different ciphertexts, so the database
 * always sees distinct values and the UNIQUE constraint is never enforced.
 * This allowed hundreds of duplicate mappings to accumulate.
 *
 * Duplicate prevention is now handled in application logic (in-memory comparison
 * of decrypted values), and findAllForUser automatically cleans up any existing
 * duplicates on next read.
 */
export class DropGitHubRepoMappingsBrokenUniqueIndex1774000000000 implements MigrationInterface {
  name = "DropGitHubRepoMappingsBrokenUniqueIndex1774000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_github_repo_mappings_userId_owner_repo"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the index on rollback (even though it did not enforce uniqueness
    // due to encrypted columns, we restore it to match the previous schema state).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_github_repo_mappings_userId_owner_repo"
      ON "github_repo_mappings" ("userId", "owner", "repo")
    `);
  }
}
