import type { PgBoss } from "pg-boss";

import { QUEUE_JOB_STATE } from "../constants/domain-statuses";
import { JOB_NAMES } from "../constants/job-names";
import { getJobPriority } from "../queue/job-priorities";
import { getBossDb } from "./email-controller.helpers";

/**
 * Why a re-categorisation batch was queued when it wasn't the user pressing
 * "Re-categorise". Stored on every job of the batch so the batch can be found
 * again while it runs (to avoid queuing a second, overlapping run).
 */
export const RECATEGORIZE_TRIGGER = {
  /** Onboarding just saved the user's categories; sort the threads synced before them. */
  ONBOARDING_CATEGORIES_SAVED: "onboarding_categories_saved",
} as const;

export type RecategorizeTrigger =
  (typeof RECATEGORIZE_TRIGGER)[keyof typeof RECATEGORIZE_TRIGGER];

/** Payload of a re-categorisation `refine-priority` job. */
export interface RecategorizeJobData {
  userId: string;
  emailId: string;
  forceRecalculate: true;
  recategorizeBatchId: string;
  recategorizeTrigger?: RecategorizeTrigger;
}

export interface InFlightRecategorizeBatch {
  batchId: string;
  /** Jobs of the batch not yet finished (queued, retrying or running). */
  pending: number;
}

interface InFlightBatchRow {
  batchId: string;
  pending: number | string;
}

/**
 * Queues one forced `refine-priority` job per email, tagged with `batchId` so
 * GET /emails/recategorize-progress can report on the batch. Every
 * re-categorisation goes through here so the Settings button, onboarding's
 * Re-categorise and the automatic onboarding sort run the same pipeline (Jev,
 * constrained to the user's categories). No singleton options: pg-boss would
 * drop a re-run started in the same minute, so changes made since the last run
 * would never be applied.
 */
export async function enqueueRecategorizationJobs(
  boss: PgBoss,
  options: {
    userId: string;
    emailIds: readonly string[];
    batchId: string;
    trigger?: RecategorizeTrigger;
  },
): Promise<number> {
  const { userId, emailIds, batchId, trigger } = options;
  let queued = 0;
  for (const emailId of emailIds) {
    const jobData: RecategorizeJobData = {
      userId,
      emailId,
      forceRecalculate: true,
      recategorizeBatchId: batchId,
      ...(trigger ? { recategorizeTrigger: trigger } : {}),
    };
    const jobId = await boss.send(JOB_NAMES.REFINE_PRIORITY, jobData, {
      priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY, true),
    });
    if (jobId != null) queued++;
  }
  return queued;
}

/**
 * The user's still-running re-categorisation batch queued by `trigger`, or null
 * when none of its jobs are left to run. pg-boss's job_state enum orders
 * created < retry < active < completed, so `state < completed` is "not finished"
 * and can use pg-boss's own partial indexes.
 */
export async function findInFlightRecategorizationBatch(
  boss: PgBoss,
  userId: string,
  trigger: RecategorizeTrigger,
): Promise<InFlightRecategorizeBatch | null> {
  const result = await getBossDb(boss).executeSql(
    `SELECT data->>'recategorizeBatchId' AS "batchId", COUNT(*)::int AS pending
     FROM pgboss.job
     WHERE name = $1
       AND data->>'userId' = $2
       AND data->>'recategorizeTrigger' = $3
       AND state < $4
     GROUP BY data->>'recategorizeBatchId'
     ORDER BY pending DESC
     LIMIT 1`,
    [JOB_NAMES.REFINE_PRIORITY, userId, trigger, QUEUE_JOB_STATE.COMPLETED],
  );
  const row = result?.rows?.[0] as InFlightBatchRow | undefined;
  if (!row?.batchId) return null;
  const pending = Number(row.pending) || 0;
  return pending > 0 ? { batchId: row.batchId, pending } : null;
}
