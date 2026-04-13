/**
 * RDS connection and write operations for the email prioritiser Lambda.
 *
 * Uses `pg` directly (not TypeORM) to keep the Lambda bundle lean and
 * reuse connections across warm invocations.
 *
 * Writes priority results to the `email_threads` table via RDS Proxy.
 * Handles triage-preserved entries (no-op + unlock) and fallback entries.
 */
import { Client } from "pg";
import { getDbSecrets } from "./secrets";
import type { PriorityBatchPayload, BatchPriorityResult } from "./types";

let pgClient: Client | null = null;
let isConnected = false;

const MAX_CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDbClient(): Promise<Client> {
  if (pgClient && isConnected) return pgClient;

  const secrets = await getDbSecrets();
  const host = process.env.RDS_PROXY_ENDPOINT || secrets.host;

  pgClient = new Client({
    host,
    port: secrets.port,
    user: secrets.username,
    password: secrets.password,
    database: secrets.database,
    // RDS Proxy uses an internal AWS certificate — disable verification to avoid
    // hostname mismatch errors within the VPC.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  isConnected = false;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await pgClient.connect();
      isConnected = true;
      return pgClient;
    } catch (err) {
      console.error(`[db] connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed:`, err);
      if (attempt === MAX_CONNECT_ATTEMPTS) {
        pgClient = null;
        isConnected = false;
        throw err;
      }
      await sleep(CONNECT_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error("unreachable");
}

/** Sentinel value for triage-preserved urgency score. */
const TRIAGE_PRESERVED_URGENCY = -1;

interface EmailThreadRow {
  id: string;
  urgencyScore: number | null;
  priorityRetryCount: number | null;
}

/**
 * Retrieve the current urgency score and retry count for the thread associated
 * with an email key. Returns null if the email or thread is not found.
 */
async function getThreadIdForEmail(
  db: Client,
  emailKey: string,
): Promise<{ threadId: string; currentUrgencyScore: number | null; retryCount: number | null } | null> {
  try {
    const { rows } = await db.query<{ thread_id: string; urgency_score: number | null; priority_retry_count: number | null }>(
      `SELECT et.id AS thread_id, et.urgency_score, et.priority_retry_count
       FROM email_threads et
       JOIN emails e ON e.email_thread_id = et.id
       WHERE e.id = $1
       LIMIT 1`,
      [emailKey],
    );
    if (rows.length === 0) return null;
    return {
      threadId: rows[0].thread_id,
      currentUrgencyScore: rows[0].urgency_score,
      retryCount: rows[0].priority_retry_count,
    };
  } catch (err) {
    // Force reconnect on next invocation — the connection may have been recycled by RDS Proxy
    pgClient = null;
    isConnected = false;
    throw err;
  }
}

/**
 * Build the priorityExplanation JSONB payload from a BatchPriorityResult.
 * Only includes fields that are meaningful (skips sentinel values like -1 for triage-preserved).
 */
function buildPriorityExplanation(result: BatchPriorityResult, calculatedAt: string): Record<string, unknown> {
  return {
    breakdown: result.isFallback
      ? [
          { factor: "Fallback", value: result.urgencyScore, description: result.urgencyExplanation },
        ]
      : [
          { factor: "🔥 Urgency", value: result.urgencyScore, description: result.urgencyExplanation },
          { factor: "🎯 Goal Alignment", value: result.goalAlignmentScore, description: result.goalAlignmentExplanation },
          { factor: "😊 Sentiment", value: result.sentimentScore ?? 0, description: "" },
        ],
    calculatedAt,
  };
}

/**
 * Write a single email's priority result to the database.
 *
 * - Triage-preserved (triagePreserved=true): no-op, just unlock the thread.
 * - Fallback (isFallback=true): insert retry marker, do NOT overwrite valid scores.
 * - Normal result: update urgency_score, priority_explanation, category_id, etc.
 */
export async function savePriorityResult(
  emailKey: string,
  result: BatchPriorityResult,
): Promise<void> {
  const db = await getDbClient();
  const threadInfo = await getThreadIdForEmail(db, emailKey);

  if (!threadInfo) {
    console.warn(`[db] No thread found for email ${emailKey} — skipping write`);
    return;
  }

  const { threadId } = threadInfo;
  const calculatedAt = new Date().toISOString();

  try {
    // Triage-preserved: unlock thread, preserve existing scores
    if (result.triagePreserved) {
      await db.query(
        `UPDATE email_threads
         SET is_processing_priority = false, updated_at = NOW()
         WHERE id = $1`,
        [threadId],
      );
      console.log(`[db] Triage-preserved thread ${threadId} — unlocked, scores unchanged`);
      return;
    }

    // Fallback: do NOT overwrite existing scores; increment retry count and requeue via server
    if (result.isFallback) {
      await db.query(
        `UPDATE email_threads
         SET is_processing_priority = false,
             priority_retry_count = COALESCE(priority_retry_count, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [threadId],
      );
      console.log(`[db] Fallback result for thread ${threadId} — unlocked, retry count incremented`);
      return;
    }

    // Normal result: compute final score (same formula as LLMPriorityResultService)
    const breakdown = buildPriorityExplanation(result, calculatedAt);
    const finalScore = Math.max(
      0,
      Math.min(100, result.urgencyScore + Math.round(result.goalAlignmentScore * 0.4)),
    );

    // Upsert priority explanation JSONB — merge with existing to preserve old fields
    const priorityExplanation = JSON.stringify({
      score: finalScore,
      breakdown: breakdown.breakdown,
      calculatedAt,
    });

    await db.query(
      `UPDATE email_threads SET
         urgency_score = $1,
         urgency_explanation = $2,
         priority_explanation = $3::jsonb,
         priority_score = $4,
         is_processing_priority = false,
         updated_at = NOW()
       WHERE id = $5`,
      [
        result.urgencyScore,
        result.urgencyExplanation,
        priorityExplanation,
        finalScore,
        threadId,
      ],
    );

    console.log(`[db] Updated thread ${threadId}: urgencyScore=${result.urgencyScore}, priorityScore=${finalScore}`);
  } catch (err) {
    // Force reconnect on next invocation — the connection may have been recycled by RDS Proxy
    pgClient = null;
    isConnected = false;
    throw err;
  }
}

/**
 * Write all priority results for a batch to the database.
 */
export async function saveBatchResults(
  payload: PriorityBatchPayload,
  results: Map<string, BatchPriorityResult>,
): Promise<void> {
  const errors: string[] = [];

  for (const email of payload.emails) {
    const result = results.get(email.emailKey);
    if (!result) {
      console.warn(`[db] No result for email ${email.emailKey} in batch ${payload.batchIndex}`);
      continue;
    }
    try {
      await savePriorityResult(email.emailKey, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] Failed to save result for ${email.emailKey}: ${msg}`);
      errors.push(`${email.emailKey}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `saveBatchResults: ${errors.length} email(s) failed: ${errors.join("; ")}`,
    );
  }
}

/**
 * Increment the completed_batches counter on the tracking record and flip
 * status to 'completed' once all batches are done.
 *
 * Failures here are non-critical: the PriorityAnalysisFinalizerService on
 * the server side will clean up any runs that never reach 'completed' status.
 */
export async function markBatchComplete(
  analysisId: string,
  totalBatches: number,
): Promise<void> {
  const db = await getDbClient();
  try {
    const { rows } = await db.query<{ completed_batches: number }>(
      `UPDATE priority_analysis_runs
       SET completed_batches = completed_batches + 1,
           status = CASE
             WHEN completed_batches + 1 >= $2 THEN 'completed'
             ELSE status
           END,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING completed_batches`,
      [analysisId, totalBatches],
    );
    if (rows.length > 0) {
      console.log(
        `[db] Analysis ${analysisId}: batch complete (${rows[0].completed_batches}/${totalBatches})`,
      );
    } else {
      console.warn(
        `[db] markBatchComplete: no run record found for analysisId=${analysisId}`,
      );
    }
  } catch (err) {
    // Non-critical — log and continue. The finalizer will catch stalled runs.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db] Failed to mark batch complete for analysis ${analysisId}: ${msg}`,
    );
  }
}
