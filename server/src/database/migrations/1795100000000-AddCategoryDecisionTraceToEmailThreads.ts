import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `categoryDecisionTrace` to email_threads: an encrypted JSON record of
 * every step that produced a category candidate (deterministic rule, local
 * model, LLM, proto-match, GitHub override) and whether each was applied or
 * suppressed. Makes silent re-routes — e.g. the GitHub "bot updates" override
 * clobbering a confident category — visible in the category debug UI. Null for
 * threads categorised before this column existed.
 */
export class AddCategoryDecisionTraceToEmailThreads1795100000000
  implements MigrationInterface
{
  name = "AddCategoryDecisionTraceToEmailThreads1795100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "categoryDecisionTrace" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "categoryDecisionTrace"`,
    );
  }
}
