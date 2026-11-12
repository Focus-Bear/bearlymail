/**
 * The SQS message the worker sends the prioritisation Lambda for one batch.
 * Ids only: the Lambda reads (and decrypts) the emails itself, so no email
 * content is ever written to the queue.
 */
export const PRIORITY_BATCH_MESSAGE_VERSION = 2;

export interface PriorityBatchLambdaMessage {
  version: typeof PRIORITY_BATCH_MESSAGE_VERSION;
  userId: string;
  /** PriorityAnalysisRun id; the Lambda marks it complete when done. */
  analysisId: string;
  emailIds: string[];
  /**
   * Emails whose thread's stale rule label the worker just released. They must
   * skip triage, or it would "preserve" the old category. Optional, so
   * messages without it stay valid.
   */
  forceFullAnalysisEmailIds?: string[];
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Validates an SQS body; throws on anything that isn't a v2 batch message. */
export function parsePriorityBatchLambdaMessage(
  body: string,
): PriorityBatchLambdaMessage {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Priority batch message is not an object");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== PRIORITY_BATCH_MESSAGE_VERSION) {
    throw new Error(
      `Unsupported priority batch message version: ${String(candidate.version)}`,
    );
  }
  if (
    typeof candidate.userId !== "string" ||
    typeof candidate.analysisId !== "string" ||
    !isStringArray(candidate.emailIds) ||
    candidate.emailIds.length === 0
  ) {
    throw new Error(
      "Priority batch message is missing userId/analysisId/emailIds",
    );
  }
  const rawForceFull = candidate.forceFullAnalysisEmailIds;
  if (rawForceFull !== undefined && !isStringArray(rawForceFull)) {
    throw new Error(
      "Priority batch message has an invalid forceFullAnalysisEmailIds",
    );
  }
  const forceFull = rawForceFull as string[] | undefined;
  return {
    version: PRIORITY_BATCH_MESSAGE_VERSION,
    userId: candidate.userId,
    analysisId: candidate.analysisId,
    emailIds: candidate.emailIds,
    ...(forceFull?.length ? { forceFullAnalysisEmailIds: forceFull } : {}),
  };
}
