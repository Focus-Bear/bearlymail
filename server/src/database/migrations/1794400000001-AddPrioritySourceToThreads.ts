import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `email_threads.prioritySource` — tracks whether a thread's priorityScore
 * was set by the LLM ('llm') or a deterministic priority rule ('rule'). The
 * priority-rule miner excludes rule-scored threads so a rule cannot reinforce
 * itself (issue: deterministic priority rules). Nullable; legacy rows stay null
 * (treated as LLM-derived for mining).
 */
export class AddPrioritySourceToThreads1794400000001
  implements MigrationInterface
{
  name = "AddPrioritySourceToThreads1794400000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_threads"
      ADD COLUMN IF NOT EXISTS "prioritySource" varchar NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "email_threads"."prioritySource" IS
        'How priorityScore was last set: ''llm'' or ''rule'''
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "prioritySource"`,
    );
  }
}
