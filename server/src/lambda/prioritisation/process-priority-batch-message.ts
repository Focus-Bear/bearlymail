import { JOB_NAMES } from "../../constants/job-names";
import { parsePriorityBatchLambdaMessage } from "../../emails/priority-batch-lambda-message";
import { JobPerformanceTracker } from "../../queue/job-performance-tracker";
import type { PrioritisationRuntime } from "./prioritisation-runtime";
import { markRunBatchComplete } from "./priority-run-store";

const LAMBDA_WORKER_ID = "lambda";

/**
 * Runs one dispatched batch exactly as the worker would — same runner, same
 * prompts, same apply — under the user's encryption key. Throws on failure so
 * SQS redelivers; threads stuck mid-run are unlocked by the worker's
 * PriorityAnalysisFinalizerService once the run stalls.
 */
export async function processPriorityBatchMessage(
  runtime: PrioritisationRuntime,
  body: string,
): Promise<void> {
  const message = parsePriorityBatchLambdaMessage(body);
  const tracker = new JobPerformanceTracker(
    JOB_NAMES.REFINE_PRIORITY_BATCH,
    message.analysisId,
    runtime.cloudWatchService,
  );
  tracker.setMetadata({
    userId: message.userId,
    batchSize: message.emailIds.length,
  });
  try {
    await runtime.userEncryptionService.withUserKey(message.userId, () =>
      runtime.runner.analyseAndApplyByIds(
        LAMBDA_WORKER_ID,
        message.userId,
        message.emailIds,
        tracker,
        message.forceFullAnalysisEmailIds
          ? new Set(message.forceFullAnalysisEmailIds)
          : undefined,
      ),
    );
    await markRunBatchComplete(runtime.dataSource, message.analysisId);
    tracker.finish();
  } catch (error) {
    tracker.finish(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
