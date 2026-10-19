import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Records WHICH AI engine made a thread's category and priority decisions
 * (`openai`, `gemini`, `bedrock`, `anthropic`, `claude-cli` or `jev`), so the
 * popover can say "LLM (Gemini)" / "TypeSafe AI (Jev)" instead of a generic
 * "AI language model". Nullable: rows decided before this existed, and
 * rule/local/user decisions, carry no provider and show a generic label.
 */
export class AddDecisionProvidersToEmailThreads1796900000000
  implements MigrationInterface
{
  name = "AddDecisionProvidersToEmailThreads1796900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "categoryDecisionProvider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "priorityDecisionProvider" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "priorityDecisionProvider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "categoryDecisionProvider"`,
    );
  }
}
