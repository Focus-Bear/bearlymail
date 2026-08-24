import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add `keepInAction` column to `email_threads`.
 *
 * Fixes #2125: a thread in Action mode dropped into Follow-Up as soon as the
 * user replied, because the Action↔Follow-Up split is derived purely from who
 * sent the last email. When the user chooses "I still need to take action" on
 * their reply, this flag pins the thread to Action mode — the Action filter
 * keeps it and the Follow-Up filter excludes it, instead of the thread
 * re-emerging in Follow-Up via the implicit "starred + sent-last" rule.
 *
 * A later reply that schedules a follow-up or archives the thread clears the
 * flag. NOT NULL with a false default: existing threads start unpinned. Adding
 * a column with a constant default is a metadata-only change on Postgres 11+
 * (no table rewrite).
 */
export class AddKeepInActionToEmailThreads1796200000000
  implements MigrationInterface
{
  name = "AddKeepInActionToEmailThreads1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "keepInAction" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "keepInAction"`,
    );
  }
}
