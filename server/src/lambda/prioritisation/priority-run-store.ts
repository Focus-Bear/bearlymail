import type { DataSource } from "typeorm";

import type { ApplySerialiser } from "../../emails/priority-batch-analysis-runner";

const APPLY_LOCK_NAMESPACE = "priority-apply:";

/**
 * Serialises applyBatchResults per user across concurrent Lambda invocations.
 * Proto-category find/create/promotion is read-then-write and its unique index
 * is on ciphertext, so two batches for one user applying at once can create
 * duplicate proto categories. The worker gets this for free by running one
 * batch per process; Lambdas fan out, so they take a Postgres advisory lock.
 */
export function createAdvisoryApplySerialiser(
  dataSource: DataSource,
): ApplySerialiser {
  return async (userId, work) => {
    const lockKey = `${APPLY_LOCK_NAMESPACE}${userId}`;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [lockKey],
      );
      try {
        return await work();
      } finally {
        await queryRunner.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [lockKey],
        );
      }
    } finally {
      await queryRunner.release();
    }
  };
}

/**
 * Counts one finished batch toward its PriorityAnalysisRun and completes the
 * run once every batch is in. A single UPDATE keeps it atomic when batches of
 * one run finish on different Lambdas.
 */
export async function markRunBatchComplete(
  dataSource: DataSource,
  analysisId: string,
): Promise<void> {
  await dataSource.query(
    `UPDATE priority_analysis_runs
        SET "completedBatches" = "completedBatches" + 1,
            status = CASE WHEN "completedBatches" + 1 >= "totalBatches"
                          THEN 'completed' ELSE status END,
            "updatedAt" = NOW()
      WHERE id = $1`,
    [analysisId],
  );
}
