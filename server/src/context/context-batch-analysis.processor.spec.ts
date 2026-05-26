import { CloudWatchService } from "../aws/cloudwatch.service";
import {
  classifyBatchError,
  ContextBatchAnalysisProcessor,
} from "./context-batch-analysis.processor";

describe("classifyBatchError", () => {
  it("classifies rate limit errors", () => {
    expect(classifyBatchError(new Error("rate limit exceeded"))).toBe(
      "rate_limit",
    );
    expect(classifyBatchError(new Error("HTTP 429 Too Many Requests"))).toBe(
      "rate_limit",
    );
    expect(classifyBatchError("429 error")).toBe("rate_limit");
  });

  it("classifies timeout errors", () => {
    expect(classifyBatchError(new Error("Request timeout"))).toBe("timeout");
    expect(classifyBatchError(new Error("ETIMEDOUT"))).toBe("timeout");
    expect(classifyBatchError("Connection timeout")).toBe("timeout");
  });

  it("classifies token limit errors", () => {
    expect(classifyBatchError(new Error("token limit exceeded"))).toBe(
      "token_limit",
    );
    expect(
      classifyBatchError(new Error("exceeded token limit for model")),
    ).toBe("token_limit");
  });

  it("classifies parse errors", () => {
    expect(classifyBatchError(new Error("failed to parse response"))).toBe(
      "parse_error",
    );
    expect(classifyBatchError(new Error("JSON syntax error"))).toBe(
      "parse_error",
    );
    expect(classifyBatchError("JSON parse failed")).toBe("parse_error");
  });

  it("classifies network errors", () => {
    expect(classifyBatchError(new Error("ECONNREFUSED 127.0.0.1:8080"))).toBe(
      "network_error",
    );
    expect(classifyBatchError(new Error("ENOTFOUND api.openai.com"))).toBe(
      "network_error",
    );
  });

  it("returns unknown for unrecognised errors", () => {
    expect(classifyBatchError(new Error("something went wrong"))).toBe(
      "unknown",
    );
    expect(classifyBatchError("totally unexpected")).toBe("unknown");
    expect(classifyBatchError(null)).toBe("unknown");
    expect(classifyBatchError(undefined)).toBe("unknown");
  });

  it("handles non-Error objects", () => {
    // toString produces "[object Object]" → unknown
    expect(classifyBatchError({ code: 429 })).toBe("unknown");
    // String(429) === "429" → rate_limit
    expect(classifyBatchError(429)).toBe("rate_limit");
  });
});

describe("ContextBatchAnalysisProcessor batch metric dimensions", () => {
  type BudgetMetricParams = Parameters<
    CloudWatchService["putPerformanceBudgetMetric"]
  >[0];

  let putMetric: jest.Mock;
  let processor: ContextBatchAnalysisProcessor;

  beforeEach(() => {
    putMetric = jest.fn().mockResolvedValue(undefined);

    // Build the processor without its heavy constructor (os.cpus / config
    // parsing), wiring only the collaborators the metric-emitting methods touch.
    processor = Object.create(ContextBatchAnalysisProcessor.prototype);
    Object.assign(processor, {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      cloudWatchService: {
        putPerformanceBudgetMetric: putMetric,
      } as unknown as CloudWatchService,
      gmailDataService: { fetchThreadsByIds: jest.fn().mockResolvedValue([]) },
      llmService: {
        analyzeEmailPatterns: jest
          .fn()
          .mockResolvedValue({ context: [], writingStyle: null }),
      },
      contextAnalysisRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: "rec-1",
          stats: { batchResults: {} },
          analyzedCount: 0,
        }),
        save: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  /** Every params object passed to putPerformanceBudgetMetric so far. */
  function emittedMetrics(): BudgetMetricParams[] {
    return putMetric.mock.calls.map((call) => call[0] as BudgetMetricParams);
  }

  it("never emits UserId/WorkerId or other per-run values as dimensions across all five batch metrics", async () => {
    const internals = processor as any;

    await internals.fetchAndProcessThreads(
      "worker-1",
      "user-1",
      ["thread-1"],
      "user@example.com",
    );
    await internals.runLlmAnalysis({
      workerId: "worker-1",
      userId: "user-1",
      batch: [],
      sentPayload: [],
      userEmail: "user@example.com",
      currentContextForPrompt: [],
    });
    await internals.saveBatchResults({
      workerId: "worker-1",
      batchIndex: 0,
      analysisRecordId: "rec-1",
      batch: [],
      batchAnalysis: { context: [], writingStyle: null },
    });
    internals.emitTotalBudgetMetric({
      workerId: "worker-1",
      fetchDuration: 10,
      processDuration: 10,
      llmDuration: 10,
      saveDuration: 10,
    });

    const metrics = emittedMetrics();

    // All five batch budgets must have emitted exactly once.
    expect(metrics.map((metric) => metric.budgetName).sort()).toEqual(
      [
        "BATCH_FETCH_THREADS",
        "BATCH_LLM_ANALYSIS",
        "BATCH_PROCESS_THREADS",
        "BATCH_SAVE_RESULTS",
        "BATCH_TOTAL",
      ].sort(),
    );

    // Per-execution values explode CloudWatch cardinality and must never be
    // promoted to dimensions (see #2223). They belong in logs / the metric value.
    const forbiddenDimensions = [
      "UserId",
      "WorkerId",
      "ThreadCount",
      "BatchSize",
      "FetchDuration",
      "ProcessDuration",
      "LlmDuration",
      "SaveDuration",
    ];
    for (const metric of metrics) {
      expect(metric.budgetType).toBe("batch");
      const dimensionKeys = metric.metadata ? Object.keys(metric.metadata) : [];
      for (const forbidden of forbiddenDimensions) {
        expect(dimensionKeys).not.toContain(forbidden);
      }
    }
  });
});
