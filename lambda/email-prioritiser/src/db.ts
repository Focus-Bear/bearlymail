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
import { encryptUtf8 } from "./encryption";
import { getDbSecrets } from "./secrets";
import type { PriorityBatchPayload, BatchPriorityResult } from "./types";
import { resolveUserKey } from "./user-key";

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
    ssl: { rejectUnauthorized: false }, // nosemgrep
    connectionTimeoutMillis: 10_000,
  });

  isConnected = false;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await pgClient.connect();
      isConnected = true;
      return pgClient;
    } catch (err) {
      console.error(`[db] connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed:`, err); // nosemgrep
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
): Promise<{
  threadId: string;
  currentUrgencyScore: number | null;
  retryCount: number | null;
  starCount: number | null;
  isBatched: boolean | null;
} | null> {
  try {
    // NOTE: email_threads columns are camelCase (no snake_case naming
    // strategy) — identifiers must be double-quoted.
    const { rows } = await db.query<{
      thread_id: string;
      urgency_score: number | null;
      priority_retry_count: number | null;
      star_count: number | null;
      is_batched: boolean | null;
    }>(
      `SELECT et.id AS thread_id, et."urgencyScore" AS urgency_score,
              et."priorityRetryCount" AS priority_retry_count,
              et."starCount" AS star_count, et."isBatched" AS is_batched
       FROM email_threads et
       JOIN emails e ON e."emailThreadId" = et.id
       WHERE e.id = $1
       LIMIT 1`,
      [emailKey],
    );
    if (rows.length === 0) return null;
    return {
      threadId: rows[0].thread_id,
      currentUrgencyScore: rows[0].urgency_score,
      retryCount: rows[0].priority_retry_count,
      starCount: rows[0].star_count,
      isBatched: rows[0].is_batched,
    };
  } catch (err) {
    // Force reconnect on next invocation — the connection may have been recycled by RDS Proxy
    pgClient = null;
    isConnected = false;
    throw err;
  }
}

// Scoring weights — MUST mirror calculateScoreContributions in
// server/src/emails/score-contributions.helper.ts so the Lambda and worker
// paths write comparable priority scores. (VIP/sender-title/failing-CI bumps
// are server-only extras the Lambda has no data for.)
const URGENCY_NEUTRAL = 50;
const URGENCY_WEIGHT = 0.8;
const GOAL_ALIGNMENT_WEIGHT = 0.4;
const SENTIMENT_MULTIPLIER = 30;
const SENTIMENT_NEGATIVE_THRESHOLD = -0.3;
const NEWSLETTER_DISCOUNT_MULTIPLIER = 0.25;
const NEWSLETTER_CATEGORY_PATTERNS = [
  "newsletter",
  "digest",
  "marketing",
  "promotional",
];

/** Composite priority score from the LLM's dimension scores — server-formula mirror. */
function calculateCompositeScore(result: BatchPriorityResult): number {
  const urgencyScore = result.urgencyScore || 0;
  const goalAlignmentScore = result.goalAlignmentScore || 0;
  const sentimentScore = result.sentimentScore ?? 0;
  const isNewsletterCategory = NEWSLETTER_CATEGORY_PATTERNS.some((pattern) =>
    (result.category || "").toLowerCase().includes(pattern),
  );

  let urgencyContribution = Math.round(
    (urgencyScore - URGENCY_NEUTRAL) * URGENCY_WEIGHT,
  );
  let goalAlignmentContribution = Math.round(
    goalAlignmentScore * GOAL_ALIGNMENT_WEIGHT,
  );
  if (isNewsletterCategory) {
    urgencyContribution = Math.round(
      urgencyContribution * NEWSLETTER_DISCOUNT_MULTIPLIER,
    );
    goalAlignmentContribution = Math.round(
      goalAlignmentContribution * NEWSLETTER_DISCOUNT_MULTIPLIER,
    );
  }
  const sentimentContribution =
    sentimentScore < SENTIMENT_NEGATIVE_THRESHOLD
      ? Math.round(-sentimentScore * SENTIMENT_MULTIPLIER)
      : 0;

  return urgencyContribution + goalAlignmentContribution + sentimentContribution;
}

/** Composite priority score at/above which a thread is delivered immediately. */
const EMERGENCY_SCORE_THRESHOLD = 75;
/** LLM urgency dimension (0–100) at/above which a thread is delivered immediately. */
const CRITICAL_URGENCY_THRESHOLD = 90;

/**
 * Un-batch a thread for immediate delivery when its priority score is high
 * enough or its urgency dimension is critical — mirrors
 * applyEmergencyDelivery in server/src/emails/emergency-delivery.helper.ts.
 */
async function applyEmergencyDelivery(
  db: Client,
  args: {
    threadId: string;
    userId: string;
    finalScore: number;
    urgencyScore: number;
    starCount: number | null;
    isBatched: boolean | null;
  },
): Promise<void> {
  const { threadId, userId, finalScore, urgencyScore } = args;
  // Starred + already delivered: no-op.
  if ((args.starCount ?? 0) > 0 && !(args.isBatched ?? true)) return;
  const isCriticalUrgency = urgencyScore >= CRITICAL_URGENCY_THRESHOLD;
  if (finalScore < EMERGENCY_SCORE_THRESHOLD && !isCriticalUrgency) return;
  const reason = isCriticalUrgency
    ? `Emergency delivery (critical urgency ${urgencyScore})`
    : `Emergency delivery (score ${finalScore})`;
  await db.query(
    `UPDATE email_threads SET
       "isBatched" = false,
       "batchReleaseAt" = NULL,
       "wasDeliveredEarly" = true,
       "batchDecisionReason" = $1,
       "updatedAt" = NOW()
     WHERE id = $2 AND "userId" = $3`,
    [reason, threadId, userId],
  );
  console.log(`[db] ${reason} applied to thread ${threadId}`);
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
  userId: string,
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
         SET "isProcessingPriority" = false, "updatedAt" = NOW()
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
         SET "isProcessingPriority" = false,
             "priorityRetryCount" = COALESCE("priorityRetryCount", 0) + 1,
             "updatedAt" = NOW()
         WHERE id = $1`,
        [threadId],
      );
      console.log(`[db] Fallback result for thread ${threadId} — unlocked, retry count incremented`);
      return;
    }

    // Normal result: compute final score (mirrors the server's
    // calculateScoreContributions — previously used a different formula that
    // wrote much higher scores than the worker path).
    const breakdown = buildPriorityExplanation(result, calculatedAt);
    const finalScore = calculateCompositeScore(result);

    const priorityExplanation = JSON.stringify({
      score: finalScore,
      breakdown: breakdown.breakdown,
      calculatedAt,
    });

    // Both explanation columns are encrypted-at-rest on the server
    // (encryptedColumnTransformer / encryptedJsonTransformer, stored as text).
    // Encrypt under the user's per-user key — writing plaintext (as before) or
    // the wrong key would be inconsistent with how the server reads them.
    const derivedKey = await resolveUserKey(db, userId);
    const encryptedUrgencyExplanation =
      result.urgencyExplanation != null
        ? encryptUtf8(result.urgencyExplanation, derivedKey)
        : null;
    const encryptedPriorityExplanation = encryptUtf8(
      priorityExplanation,
      derivedKey,
    );

    await db.query(
      `UPDATE email_threads SET
         "urgencyScore" = $1,
         "urgencyExplanation" = $2,
         "priorityExplanation" = $3,
         "priorityScore" = $4,
         "isProcessingPriority" = false,
         "updatedAt" = NOW()
       WHERE id = $5`,
      [
        result.urgencyScore,
        encryptedUrgencyExplanation,
        encryptedPriorityExplanation,
        finalScore,
        threadId,
      ],
    );

    await applyEmergencyDelivery(db, {
      threadId,
      userId,
      finalScore,
      urgencyScore: result.urgencyScore,
      starCount: threadInfo.starCount,
      isBatched: threadInfo.isBatched,
    });

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
      await savePriorityResult(payload.userId, email.emailKey, result);
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
       SET "completedBatches" = "completedBatches" + 1,
           status = CASE
             WHEN "completedBatches" + 1 >= $2 THEN 'completed'
             ELSE status
           END,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING "completedBatches" AS completed_batches`,
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
