import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add `lastRecategorisedAt` column to `email_threads`.
 *
 * Supports the admin-triggered rule-label re-categorisation job
 * (RuleLabelReCategoriseService), which cleans up historical category labels
 * that a now-removed over-broad deterministic rule wrote (categorySource
 * 'rule'), so the daily-retrained local model learns from trustworthy labels.
 *
 * The column is the job's idempotency marker: after it processes a thread it
 * stamps this timestamp, and the selection query skips threads stamped within
 * the job's look-back window. That guarantees a safe re-run — a bulk cleanup
 * never re-hits the LLM for a thread it already handled — independently of how
 * the thread's `categorySource` flipped.
 *
 * Nullable with no backfill: existing threads start NULL ("never processed by
 * this job"), which the selection query treats as eligible. Adding a nullable
 * column is a metadata-only change on Postgres (no table rewrite).
 */
export class AddLastRecategorisedAtToEmailThreads1795800000000
  implements MigrationInterface
{
  name = "AddLastRecategorisedAtToEmailThreads1795800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "lastRecategorisedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN IF EXISTS "lastRecategorisedAt"`,
    );
  }
}
