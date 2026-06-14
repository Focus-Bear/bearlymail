import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `localModelDebug` to email_threads: an encrypted JSON snapshot of what
 * the local category/priority model predicted, the LLM's answer, agreement, and
 * which decided. Powers the category debug UI's decision-source / local-vs-LLM
 * view. Null until the local model scores the thread.
 */
export class AddLocalModelDebugToEmailThreads1794700000000
  implements MigrationInterface
{
  name = "AddLocalModelDebugToEmailThreads1794700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "localModelDebug" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "localModelDebug"`,
    );
  }
}
