import * as fs from "fs";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { JobPerformanceTracker } from "./job-performance-tracker";

jest.mock("fs");

describe("JobPerformanceTracker", () => {
  let mockCloudWatch: jest.Mocked<
    Pick<CloudWatchService, "putPerformanceBudgetMetric">
  >;
  let appendMock: jest.Mock;

  beforeEach(() => {
    mockCloudWatch = {
      putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
    };
    // Capture log writes without touching the filesystem.
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    appendMock = fs.appendFileSync as jest.Mock;
    appendMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Returns the metadata passed to the single CloudWatch metric emission. */
  function emittedMetadata(): Record<string, string> | undefined {
    expect(mockCloudWatch.putPerformanceBudgetMetric).toHaveBeenCalledTimes(1);
    return mockCloudWatch.putPerformanceBudgetMetric.mock.calls[0][0].metadata;
  }

  /** Parses the JSON log entry written to performance.log. */
  function loggedEntry(): Record<string, unknown> {
    expect(appendMock).toHaveBeenCalled();
    const line = appendMock.mock.calls[0][1] as string;
    return JSON.parse(line.trim());
  }

  it("does NOT emit JobId or UserId as metric dimensions", () => {
    const tracker = new JobPerformanceTracker(
      "refine-priority",
      "job-abc-123",
      mockCloudWatch as unknown as CloudWatchService,
    );
    tracker.setMetadata({ userId: "user-xyz-789" });

    tracker.finish();

    const metadata = emittedMetadata();
    expect(metadata).not.toHaveProperty("JobId");
    expect(metadata).not.toHaveProperty("UserId");
  });

  it("emits BudgetName and BudgetType for aggregation", () => {
    const tracker = new JobPerformanceTracker(
      "refine-priority",
      "job-abc-123",
      mockCloudWatch as unknown as CloudWatchService,
    );

    tracker.finish();

    const call = mockCloudWatch.putPerformanceBudgetMetric.mock.calls[0][0];
    expect(call.budgetName).toBe("refine-priority");
    expect(call.budgetType).toBe("job");
  });

  it("includes the bounded HasError flag in dimensions only when the job errors", () => {
    const okTracker = new JobPerformanceTracker(
      "refine-priority",
      "job-1",
      mockCloudWatch as unknown as CloudWatchService,
    );
    okTracker.finish();
    expect(emittedMetadata()).not.toHaveProperty("HasError");

    mockCloudWatch.putPerformanceBudgetMetric.mockClear();

    const errTracker = new JobPerformanceTracker(
      "refine-priority",
      "job-2",
      mockCloudWatch as unknown as CloudWatchService,
    );
    errTracker.finish(new Error("boom"));
    expect(emittedMetadata()).toEqual({ HasError: "true" });
  });

  it("still records jobId and userId in the performance.log entry for tracing", () => {
    const tracker = new JobPerformanceTracker(
      "refine-priority",
      "job-abc-123",
      mockCloudWatch as unknown as CloudWatchService,
    );
    tracker.setMetadata({ userId: "user-xyz-789" });

    tracker.finish();

    const entry = loggedEntry();
    expect(entry.jobId).toBe("job-abc-123");
    expect(entry.userId).toBe("user-xyz-789");
  });
});
