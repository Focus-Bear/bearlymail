import { ConfigService } from "@nestjs/config";

const mockSend = jest.fn().mockResolvedValue({});

jest.mock("@aws-sdk/client-cloudwatch", () => {
  const actual = jest.requireActual("@aws-sdk/client-cloudwatch");
  return {
    ...actual,
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutMetricDataCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

import { CloudWatchService } from "./cloudwatch.service";

/**
 * Builds a ConfigService stub that enables the real CloudWatch client (i.e. not
 * in local-dev mode) so emitted commands can be inspected.
 */
function buildConfig(): ConfigService {
  const values: Record<string, string> = {
    AUTOSCALING_ENABLED: "true",
    CLOUDWATCH_METRIC_NAMESPACE: "BearlyMail/Queue",
    NODE_ENV: "production",
    DB_HOST: "db.example.com",
    AWS_REGION: "ap-southeast-2",
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Extracts the Dimensions array from the single emitted PutMetricDataCommand. */
function dimensionsFromLastCall(): Array<{ Name: string; Value: string }> {
  const command = mockSend.mock.calls[0]?.[0];
  return command?.input?.MetricData?.[0]?.Dimensions ?? [];
}

describe("CloudWatchService.putPerformanceBudgetMetric", () => {
  let service: CloudWatchService;

  beforeEach(() => {
    mockSend.mockClear();
    service = new CloudWatchService(buildConfig());
  });

  it("always emits BudgetName and BudgetType dimensions", async () => {
    await service.putPerformanceBudgetMetric({
      budgetName: "refine-priority",
      budgetType: "job",
      durationMs: 1200,
      budgetMs: 1000,
      exceeded: true,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const dimensions = dimensionsFromLastCall();
    expect(dimensions).toEqual(
      expect.arrayContaining([
        { Name: "BudgetName", Value: "refine-priority" },
        { Name: "BudgetType", Value: "job" },
      ]),
    );
  });

  it("only promotes low-cardinality metadata to dimensions, never JobId/UserId", async () => {
    // A correctly-implemented caller should never pass JobId/UserId, but if it
    // did, this documents that whatever metadata is passed becomes a dimension —
    // hence callers must keep metadata low-cardinality.
    await service.putPerformanceBudgetMetric({
      budgetName: "refine-priority",
      budgetType: "job",
      durationMs: 800,
      budgetMs: 1000,
      exceeded: false,
      metadata: { HasError: "true" },
    });

    const dimensionNames = dimensionsFromLastCall().map((dim) => dim.Name);
    expect(dimensionNames).toContain("HasError");
    expect(dimensionNames).not.toContain("JobId");
    expect(dimensionNames).not.toContain("UserId");
  });

  it("emits the same dimensions across all three metric data points", async () => {
    await service.putPerformanceBudgetMetric({
      budgetName: "refine-priority",
      budgetType: "job",
      durationMs: 1200,
      budgetMs: 1000,
      exceeded: true,
      metadata: { HasError: "true" },
    });

    const command = mockSend.mock.calls[0][0];
    const metricData = command.input.MetricData;
    expect(metricData).toHaveLength(3);
    const dimensionSets = metricData.map(
      (metric: { Dimensions: Array<{ Name: string }> }) =>
        metric.Dimensions.map((dim) => dim.Name).sort(),
    );
    expect(dimensionSets[0]).toEqual(dimensionSets[1]);
    expect(dimensionSets[1]).toEqual(dimensionSets[2]);
  });

  it("skips falsy metadata values", async () => {
    await service.putPerformanceBudgetMetric({
      budgetName: "refine-priority",
      budgetType: "job",
      durationMs: 800,
      budgetMs: 1000,
      exceeded: false,
      metadata: { HasError: "" },
    });

    const dimensionNames = dimensionsFromLastCall().map((dim) => dim.Name);
    expect(dimensionNames).not.toContain("HasError");
  });
});
