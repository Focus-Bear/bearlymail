import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds a composite index on email_threads (userId, categoryId).
 *
 * The inbox now narrows per-category fetches by categoryId directly in SQL
 * (getInbox → runInboxQuery), so a single-category expand queries and decrypts
 * only that category's threads instead of the whole inbox. This index lets
 * Postgres resolve the category's threads via an index scan rather than
 * scanning every thread for the user.
 */
export class AddUserIdCategoryIdIndexToEmailThreads1796500000000
  implements MigrationInterface
{
  name = "AddUserIdCategoryIdIndexToEmailThreads1796500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_threads_userId_categoryId" ON "email_threads" ("userId", "categoryId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_threads_userId_categoryId"`,
    );
  }
}
