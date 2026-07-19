/**
 * Lambda handler for email priority batch analysis.
 *
 * Triggered by SQS messages from PrioritySqsDispatchService.
 * Processes a batch of emails through two-phase priority analysis:
 *   Phase 1 — Triage (cheap model): determines which emails need full reanalysis
 *   Phase 2 — Individual analysis (smart model): scores each flagged email
 *
 * Writes results directly to RDS via RDS Proxy.
 * Designed to run 30 concurrent invocations in parallel.
 */
import type { SQSEvent, SQSRecord, SQSBatchResponse, Context } from "aws-lambda";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { randomUUID } from "crypto";

import { markBatchComplete, saveBatchResults } from "./db";
import { analyzePriorityBatch } from "./llm";
import { getDbSecrets, getLlmSecrets, resolveLlmProvider } from "./secrets";
import type { PriorityBatchPayload } from "./types";

// Cold-start secrets validation
let secretsValidated = false;

async function validateSecrets(): Promise<void> {
  if (secretsValidated) return;

  const [dbSecrets, llmSecrets] = await Promise.all([
    getDbSecrets(),
    getLlmSecrets(),
  ]);

  const DB_PLACEHOLDERS = ["REPLACE_WITH_RDS_PROXY_ENDPOINT", "REPLACE_WITH_", "REPLACE"];
  if (DB_PLACEHOLDERS.some((p) => dbSecrets.host?.includes(p) || dbSecrets.password?.includes(p))) {
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
        Namespace: "BearlyMail/EmailPrioritisation",
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
    console.warn(`[LAMBDA] Failed to emit CloudWatch metric: ${metricName}`);
  }
}

async function processBatch(
  payload: PriorityBatchPayload,
  workerId: string,
): Promise<void> {
  const { userId, batchIndex, totalBatches, analysisId, emails, userContext } = payload;

  if (!emails || emails.length === 0) {
    throw new Error(`Batch ${batchIndex} has no email payloads`);
  }

  console.log(
    `[LAMBDA][Worker ${workerId}] Starting priority batch ${batchIndex + 1}/${totalBatches} ` +
    `for user ${userId} (analysis ${analysisId}, ${emails.length} emails)`,
  );

  const llmStart = Date.now();

  let lastError: unknown;
  let results: Awaited<ReturnType<typeof analyzePriorityBatch>> | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
      console.log(
        `[LAMBDA][Worker ${workerId}] Retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    try {
      results = await analyzePriorityBatch(emails, userContext, payload.userTimezone);
      break;
    } catch (err) {
      lastError = err;
      console.warn(
        `[LAMBDA][Worker ${workerId}] LLM attempt ${attempt + 1} failed: ${err}`,
      );
    }
  }

  if (!results) {
    throw lastError || new Error("Priority analysis failed after all retries");
  }

  const llmDuration = Date.now() - llmStart;
  console.log(
    `[LAMBDA][Worker ${workerId}] LLM analysis completed in ${llmDuration}ms for ${emails.length} emails`,
  );

  await emitMetric("LambdaPriorityLlmDuration", llmDuration, "Milliseconds", {
    UserId: userId,
  });

  const saveStart = Date.now();
  await saveBatchResults(payload, results);
  // Non-blocking — mark this batch done in the tracking table.
  // Errors are swallowed inside markBatchComplete; the server finalizer handles stalled runs.
  await markBatchComplete(analysisId, totalBatches);
  const saveDuration = Date.now() - saveStart;

  const totalDuration = llmDuration + saveDuration;
  const successCount = [...results.values()].filter((r) => !r.isFallback).length;
  const triagePreservedCount = [...results.values()].filter((r) => r.triagePreserved).length;
  const fallbackCount = [...results.values()].filter((r) => r.isFallback).length;

  console.log(
    `[LAMBDA][Worker ${workerId}] ✅ Completed batch ${batchIndex + 1}/${totalBatches} ` +
    `in ${totalDuration}ms — ${successCount} analysed, ${triagePreservedCount} preserved, ${fallbackCount} fallback`,
  );

  await emitMetric("LambdaPriorityBatchTotal", totalDuration, "Milliseconds", {
    UserId: userId,
  });
  await emitMetric("LambdaPriorityBatchSuccess", 1, "Count", { UserId: userId });
  await emitMetric("LambdaPriorityEmailCount", emails.length, "Count", {
    UserId: userId,
  });
}

export const handler = async (
  event: SQSEvent,
  _context: Context,
): Promise<SQSBatchResponse> => {
  await validateSecrets();

  const records: SQSRecord[] = event.Records;
  console.log(`[LAMBDA] Processing ${records.length} SQS record(s)`);

  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

  for (const record of records) {
    const workerId = randomUUID().slice(0, 8);
    let payload: PriorityBatchPayload;

    try {
      payload = JSON.parse(record.body) as PriorityBatchPayload;
    } catch (parseError) {
      console.error(
        `[LAMBDA][Worker ${workerId}] Failed to parse SQS message body: ${parseError}`,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    const { analysisId, batchIndex } = payload;

    try {
      await processBatch(payload, workerId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const correlationId = randomUUID();

      console.error(
        `[LAMBDA][Worker ${workerId}] Batch ${batchIndex} failed for analysis ${analysisId}: ` +
        `${errorMessage} [correlation: ${correlationId}]`,
      );

      await emitMetric("LambdaPriorityBatchFailure", 1, "Count", {
        UserId: payload.userId || "unknown",
      }).catch(() => {});

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
