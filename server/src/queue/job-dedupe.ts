import { SECONDS } from "../constants/time-constants";

/**
 * pg-boss v10+ only dedupes a `singletonKey` on a standard-policy queue (every
 * queue here, see DEFAULT_QUEUE_OPTIONS) when `singletonSeconds` is set too:
 * its unique index is (name, singleton_on, singleton_key) and singleton_on is
 * only filled from singletonSeconds. A bare singletonKey enqueues every
 * duplicate, so always pair the two through this helper.
 */
export function dedupeJobOptions(
  key: string,
  windowSeconds: number,
): { singletonKey: string; singletonSeconds: number } {
  return { singletonKey: key, singletonSeconds: windowSeconds };
}

/**
 * Burst windows for jobs whose duplicates cause visible side effects. Several
 * messages of one thread arrive together (e.g. a GitHub notification burst),
 * and each used to enqueue its own job, all firing at once.
 */
export const JOB_DEDUPE_WINDOW_SECONDS = {
  /** Matches the 60s start delay: one evaluation covers the whole burst. */
  WORKFLOW_EVALUATION: SECONDS.MINUTE,
  /** One auto-response per thread anyway; collapse a burst's enqueues. */
  AUTO_RESPONDER: SECONDS.HOUR,
} as const;

export function workflowEvaluationJobKey(emailThreadId: string): string {
  return `workflow-eval-${emailThreadId}`;
}

export function autoResponderJobKey(emailThreadId: string): string {
  return `auto-responder-${emailThreadId}`;
}
