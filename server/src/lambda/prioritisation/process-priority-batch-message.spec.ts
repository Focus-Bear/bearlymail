import type { DataSource } from "typeorm";

import type { CloudWatchService } from "../../aws/cloudwatch.service";
import type { PriorityBatchAnalysisRunner } from "../../emails/priority-batch-analysis-runner";
import { PRIORITY_BATCH_MESSAGE_VERSION } from "../../emails/priority-batch-lambda-message";
import type { UserEncryptionService } from "../../encryption/user-encryption.service";
import type { PrioritisationRuntime } from "./prioritisation-runtime";
import { processPriorityBatchMessage } from "./process-priority-batch-message";

const MESSAGE = {
  version: PRIORITY_BATCH_MESSAGE_VERSION,
  userId: "user-1",
  analysisId: "analysis-1",
  emailIds: ["email-1", "email-2"],
};

function makeRuntime() {
  const query = jest.fn().mockResolvedValue(undefined);
  const analyseAndApplyByIds = jest.fn().mockResolvedValue(undefined);
  const withUserKey = jest.fn((_userId: string, task: () => Promise<void>) =>
    task(),
  );
  const runtime: PrioritisationRuntime = {
    dataSource: { query } as unknown as DataSource,
    runner: { analyseAndApplyByIds } as unknown as PriorityBatchAnalysisRunner,
    userEncryptionService: {
      withUserKey,
    } as unknown as UserEncryptionService,
    cloudWatchService: {
      putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
    } as unknown as CloudWatchService,
  };
  return { runtime, query, analyseAndApplyByIds, withUserKey };
}

describe("processPriorityBatchMessage", () => {
  it("analyses the batch under the user's key, then completes the run", async () => {
    const { runtime, query, analyseAndApplyByIds, withUserKey } = makeRuntime();

    await processPriorityBatchMessage(runtime, JSON.stringify(MESSAGE));

    expect(withUserKey).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(analyseAndApplyByIds).toHaveBeenCalledWith(
      expect.any(String),
      "user-1",
      ["email-1", "email-2"],
      expect.anything(),
      undefined,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE priority_analysis_runs"),
      ["analysis-1"],
    );
  });

  it("passes emails forced to full analysis to the runner", async () => {
    const { runtime, analyseAndApplyByIds } = makeRuntime();

    await processPriorityBatchMessage(
      runtime,
      JSON.stringify({ ...MESSAGE, forceFullAnalysisEmailIds: ["email-2"] }),
    );

    expect(analyseAndApplyByIds).toHaveBeenCalledWith(
      expect.any(String),
      "user-1",
      ["email-1", "email-2"],
      expect.anything(),
      new Set(["email-2"]),
    );
  });

  it("rethrows analysis failures without completing the run, so SQS redelivers", async () => {
    const { runtime, query, analyseAndApplyByIds } = makeRuntime();
    analyseAndApplyByIds.mockRejectedValue(new Error("LLM down"));

    await expect(
      processPriorityBatchMessage(runtime, JSON.stringify(MESSAGE)),
    ).rejects.toThrow("LLM down");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a malformed message before doing any work", async () => {
    const { runtime, analyseAndApplyByIds } = makeRuntime();

    await expect(
      processPriorityBatchMessage(runtime, JSON.stringify({ version: 1 })),
    ).rejects.toThrow("Unsupported priority batch message version");
    expect(analyseAndApplyByIds).not.toHaveBeenCalled();
  });
});
