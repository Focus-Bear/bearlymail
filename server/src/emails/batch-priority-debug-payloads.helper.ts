import { Email } from "../database/entities/email.entity";

// Values are recorded in the priority-analysis tracking debug log (issue
// #1595) — keep them stable so historical entries stay comparable.
const BATCH_DEBUG_CALLER = "runBatchRefinement";
const BATCH_DEBUG_CALLER_FILE = "llm-priority-batch.service.ts";
const BATCH_DEBUG_JOB_TYPE = "REFINE_PRIORITY_BATCH";
const SINGLE_EMAIL_COUNT = 1;

// A type alias (not an interface) so it stays assignable to DebugService's
// Record<string, unknown> entries.
export type BatchPriorityDebugPayload = {
  threadId: string | null;
  emailCount: number;
  caller: string;
  callerFile: string;
  emailId: string;
  jobType: string;
};

/**
 * One redundancy-tracking debug entry per batch email, carrying how many
 * emails from the same provider thread were analysed in this batch.
 */
export function buildBatchPriorityDebugPayloads(
  emails: Email[],
): BatchPriorityDebugPayload[] {
  const threadEmailCountMap = new Map<string, number>();
  for (const email of emails) {
    if (email.threadId) {
      threadEmailCountMap.set(
        email.threadId,
        (threadEmailCountMap.get(email.threadId) ?? 0) + 1,
      );
    }
  }
  return emails.map((email) => ({
    threadId: email.threadId ?? null,
    emailCount: email.threadId
      ? (threadEmailCountMap.get(email.threadId) ?? SINGLE_EMAIL_COUNT)
      : SINGLE_EMAIL_COUNT,
    caller: BATCH_DEBUG_CALLER,
    callerFile: BATCH_DEBUG_CALLER_FILE,
    emailId: email.id,
    jobType: BATCH_DEBUG_JOB_TYPE,
  }));
}
