import "reflect-metadata";

import { Logger } from "@nestjs/common";

import { setPromptsLogger } from "../../llm/prompts";
import { getErrorMessage } from "../../utils/error-message.util";
import { logError, logLog, logWarn } from "../../utils/logger";
import {
  createPrioritisationRuntime,
  type PrioritisationRuntime,
} from "./prioritisation-runtime";
import { processPriorityBatchMessage } from "./process-priority-batch-message";

/** The subset of the SQS event/response shapes this handler uses. */
export interface SqsRecord {
  messageId: string;
  body: string;
}
export interface SqsEvent {
  Records: SqsRecord[];
}
export interface SqsBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

const logger = new Logger("PrioritisationHandler");
setPromptsLogger({ log: logLog, warn: logWarn, error: logError });

let runtimePromise: Promise<PrioritisationRuntime> | null = null;

function getRuntime(): Promise<PrioritisationRuntime> {
  runtimePromise ??= createPrioritisationRuntime().catch((error) => {
    // Let the next invocation retry the cold start instead of caching a failure.
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

type BatchItemFailure = SqsBatchResponse["batchItemFailures"][number];

async function processRecord(
  runtime: PrioritisationRuntime,
  record: SqsRecord,
): Promise<BatchItemFailure | null> {
  try {
    await processPriorityBatchMessage(runtime, record.body);
    return null;
  } catch (error) {
    logger.error(
      `Priority batch ${record.messageId} failed: ${getErrorMessage(error)}`,
    );
    return { itemIdentifier: record.messageId };
  }
}

/**
 * SQS entry point for the prioritisation Lambda. Records are processed
 * independently and only the failed ones are reported back, so one bad batch
 * never forces a redelivery of its neighbours.
 */
export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const runtime = await getRuntime();
  const failures = await Promise.all(
    event.Records.map((record) => processRecord(runtime, record)),
  );
  return { batchItemFailures: failures.filter((failure) => failure !== null) };
}
