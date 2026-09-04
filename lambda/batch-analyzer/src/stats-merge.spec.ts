import {
  BatchFailureRecord,
  mergeBatchFailure,
  mergeBatchResult,
} from "./stats-merge";

const failure: BatchFailureRecord = {
  error: "400 Invalid body",
  failedAt: "2026-09-03T22:39:26.418Z",
  errorType: "LAMBDA_PROCESSING_ERROR",
  correlationId: "3db764a6",
};
const success = {
  context: [],
  writingStyle: null,
  completedAt: "t",
  threadIds: ["a"],
};

describe("mergeBatchFailure", () => {
  it("records the failure in both batchResults and failedBatches", () => {
    const next = mergeBatchFailure({ totalThreads: 1 }, 7, failure);
    expect(next).toEqual({
      totalThreads: 1,
      batchResults: { "7": failure },
      failedBatches: [7],
    });
  });

  it("is a no-op when the batch already has a record", () => {
    const stats = { batchResults: { "7": success } };
    expect(mergeBatchFailure(stats, 7, failure)).toBeNull();
  });

  it("does not duplicate an index already in failedBatches", () => {
    const next = mergeBatchFailure({ failedBatches: [7] }, 7, failure);
    expect(next?.failedBatches).toEqual([7]);
  });
});

describe("mergeBatchResult", () => {
  it("stores a first result and leaves failedBatches empty", () => {
    const next = mergeBatchResult({}, 2, success);
    expect(next).toEqual({ batchResults: { "2": success }, failedBatches: [] });
  });

  it("is a no-op on redelivery of an already-successful batch", () => {
    expect(
      mergeBatchResult({ batchResults: { "2": success } }, 2, success),
    ).toBeNull();
  });

  it("replaces an earlier failure when a retry succeeds and clears failedBatches", () => {
    const stats = { batchResults: { "7": failure }, failedBatches: [3, 7] };
    const next = mergeBatchResult(stats, 7, success);
    expect(next?.batchResults).toEqual({ "7": success });
    expect(next?.failedBatches).toEqual([3]);
  });
});
