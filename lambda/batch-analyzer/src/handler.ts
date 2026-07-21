/**
 * Lambda handler for context batch analysis.
 *
 * Triggered by SQS messages from the ContextAnalysisOrchestratorService.
 * Processes a single batch of email threads through LLM analysis and
 * writes results to RDS via RDS Proxy.
 *
 * Designed to run 30 concurrent invocations in parallel, completing
 * what PgBoss would do sequentially in 5-15 minutes in ~30-60 seconds.
 */
import type {
  SQSEvent,
  SQSRecord,
  SQSBatchResponse,
  Context,
} from "aws-lambda";
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { randomUUID } from "crypto";

import { saveBatchResult, saveBatchFailure } from "./db";
import {
  analyzeEmailPatterns,
  ThreadPayload,
  SentPayload,
  ContextItem,
} from "./llm";
import { sanitizeLogInput } from "./sanitize-log";
import { getDbSecrets, getLlmSecrets, resolveLlmProvider } from "./secrets";
import type { ContextBatchPayload } from "./types";

// Cold-start secrets validation: validated once per container lifetime.
// Prevents cryptic DB/API errors when Secrets Manager placeholders aren't replaced.
let secretsValidated = false;

async function validateSecrets(): Promise<void> {
  if (secretsValidated) return;

  const [dbSecrets, llmSecrets] = await Promise.all([
    getDbSecrets(),
    getLlmSecrets(),
  ]);

  const DB_PLACEHOLDERS = [
    "REPLACE_WITH_RDS_PROXY_ENDPOINT",
    "REPLACE_WITH_",
    "REPLACE",
  ];
  if (
    DB_PLACEHOLDERS.some(
      (p) => dbSecrets.host?.includes(p) || dbSecrets.password?.includes(p),
    )
  ) {
    throw new Error(
      "DB secret still has placeholder values — run the steps in infrastructure/DEPLOYMENT.md (Lambda Context Analysis section)",
    );
  }

  const provider = resolveLlmProvider(llmSecrets);
  const apiKey =
    provider === "openai"
      ? llmSecrets.OPENAI_API_KEY
      : provider === "gemini"
        ? llmSecrets.GEMINI_API_KEY
        : llmSecrets.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.includes("REPLACE")) {
    throw new Error(
      `LLM secret (provider: ${provider}) still has placeholder values — run the steps in infrastructure/DEPLOYMENT.md (Lambda Context Analysis section)`,
    );
  }

  secretsValidated = true;
  console.log("[LAMBDA] Secrets validated ✅");
}

const cloudwatch = new CloudWatchClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

// Lambda timeout is 90s; each LLM call takes ~15-30s, so only 1-2 retries are feasible.
// MAX_RETRIES = 5 was unreachable in practice.
const MAX_RETRIES = 1;

async function emitMetric(
  metricName: string,
  value: number,
  unit: "Milliseconds" | "Count" | "None",
  dimensions: Record<string, string>,
): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: "BearlyMail/ContextAnalysis",
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
              Name,
              Value,
            })),
          },
        ],
      }),
    );
  } catch {
    // Non-fatal: CloudWatch metric failure should not fail the batch
    console.warn(`[LAMBDA] Failed to emit CloudWatch metric: ${metricName}`);
  }
}

async function processBatch(
  payload: ContextBatchPayload,
  workerId: string,
): Promise<void> {
  const {
    userId,
    batchIndex,
    batch: rawBatch,
    sentPayload,
    userEmail,
    currentContextForPrompt,
    analysisRecordId,
    totalBatches,
  } = payload;

  if (!rawBatch || rawBatch.length === 0) {
    throw new Error(`Batch ${batchIndex} has no thread payloads`);
  }

  const batch: ThreadPayload[] = rawBatch.map((t) => ({
    threadId: t.threadId,
    from: t.from,
    fromName: t.fromName,
    subject: t.subject,
    body: t.body,
    receivedAt: t.receivedAt,
    isRead: t.isRead,
    timeToReply: t.timeToReply,
    starCount: t.starCount,
    isArchived: t.isArchived,
  }));

  const sent: SentPayload[] = (sentPayload || []).map((s) => ({
    emailId: s.emailId,
    to: s.to,
    subject: s.subject,
    body: s.body,
    sentAt: s.sentAt,
  }));

  const context: ContextItem[] = (currentContextForPrompt || []).map((c) => ({
    key: c.key,
    value: c.value,
    source: c.source,
  }));

  console.log(
    `[LAMBDA][Worker ${workerId}] Starting batch ${batchIndex + 1}/${totalBatches} ` +
      `for user ${userId} (analysis ${analysisRecordId}, ${batch.length} threads)`,
  );

  const llmStart = Date.now();

  let lastError: unknown;
  let batchAnalysis: Awaited<ReturnType<typeof analyzeEmailPatterns>> | null =
    null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
      console.log(
        `[LAMBDA][Worker ${workerId}] Retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    try {
      batchAnalysis = await analyzeEmailPatterns({
        receivedEmails: batch,
        sentEmails: sent,
        currentContext: context,
        userEmail: userEmail,
      });
      break; // Success
    } catch (err) {
      lastError = err;
      // Log only the error message, not the full error object: LLM SDK errors
      // can carry a response body echoing the prompt (email content) — CWE-312.
      console.warn(
        `[LAMBDA][Worker ${workerId}] LLM attempt ${attempt + 1} failed: ${sanitizeLogInput(
          err instanceof Error ? err.message : err,
        )}`,
      );
    }
  }

  if (!batchAnalysis) {
    throw lastError || new Error("LLM analysis failed after all retries");
  }

  const llmDuration = Date.now() - llmStart;
  console.log(
    `[LAMBDA][Worker ${workerId}] LLM analysis completed in ${llmDuration}ms`,
  );

  await emitMetric("LambdaBatchLlmDuration", llmDuration, "Milliseconds", {
    UserId: userId,
  });

  // Save results to RDS via RDS Proxy
  const saveStart = Date.now();
  const batchThreadIds = batch
    .map((t) => t.threadId)
    .filter((id): id is string => !!id);

  await saveBatchResult(
    userId,
    analysisRecordId,
    batchIndex,
    {
      context: batchAnalysis.context,
      writingStyle: batchAnalysis.writingStyle,
      completedAt: new Date().toISOString(),
      threadIds: batchThreadIds,
    },
    batch.length,
  );

  const saveDuration = Date.now() - saveStart;
  const totalDuration = llmDuration + saveDuration;

  console.log(
    `[LAMBDA][Worker ${workerId}] ✅ Completed batch ${batchIndex + 1}/${totalBatches} ` +
      `in ${totalDuration}ms (llm: ${llmDuration}ms, save: ${saveDuration}ms)`,
  );

  await emitMetric("LambdaBatchTotal", totalDuration, "Milliseconds", {
    UserId: userId,
  });
  await emitMetric("LambdaBatchSuccess", 1, "Count", { UserId: userId });
}

export const handler = async (
  event: SQSEvent,
  _context: Context,
): Promise<SQSBatchResponse> => {
  // Validate secrets on cold start — fail fast with a clear error if placeholders remain.
  await validateSecrets();

  const records: SQSRecord[] = event.Records;
  console.log(`[LAMBDA] Processing ${records.length} SQS record(s)`);

  // reportBatchItemFailures = true: return failed message IDs instead of throwing,
  // so SQS only re-drives the failed items rather than the entire batch.
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

  // Lambda SQS trigger is configured with batch size 1, but handle multiple defensively
  for (const record of records) {
    const workerId = randomUUID().slice(0, 8);
    let payload: ContextBatchPayload;

    try {
      payload = JSON.parse(record.body) as ContextBatchPayload;
    } catch (parseError) {
      console.error(
        `[LAMBDA][Worker ${workerId}] Failed to parse SQS message body: ${parseError}`,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    const { analysisRecordId, batchIndex } = payload;

    try {
      await processBatch(payload, workerId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const correlationId = randomUUID();
      const errorType = "LAMBDA_PROCESSING_ERROR";

      console.error(
        `[LAMBDA][Worker ${workerId}] Batch ${batchIndex} failed for analysis ${analysisRecordId}: ` +
          `${errorMessage} [correlation: ${correlationId}]`,
      );

      // Record failure in DB so finalization can account for it
      try {
        await saveBatchFailure(payload.userId, analysisRecordId, batchIndex, {
          error: errorMessage,
          failedAt: new Date().toISOString(),
          errorType,
          correlationId,
        });
      } catch (saveErr) {
        console.error(
          `[LAMBDA][Worker ${workerId}] Failed to record batch failure in DB: ${
            saveErr instanceof Error ? saveErr.message : String(saveErr)
          }`,
        );
      }

      await emitMetric("LambdaBatchFailure", 1, "Count", {
        UserId: payload.userId || "unknown",
      }).catch(() => {});

      // Report this item as failed so SQS routes only it to DLQ
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
