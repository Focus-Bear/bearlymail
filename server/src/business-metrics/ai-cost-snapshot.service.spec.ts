import { TokenUsageService } from "../llm/token-usage.service";
import { AiCostSnapshotService } from "./ai-cost-snapshot.service";

const DAY_START = new Date("2026-10-24T00:00:00Z");

describe("AiCostSnapshotService", () => {
  const getUsageSummary = jest.fn().mockResolvedValue({
    totalCalls: 120,
    totalTokens: 50_000,
    totalEstimatedCostUsd: 1.23456,
    unpricedCallCount: 3,
  });
  const service = new AiCostSnapshotService({
    getUsageSummary,
  } as unknown as TokenUsageService);

  it("queries AI usage for exactly the one UTC day", async () => {
    await service.buildSnapshot(DAY_START);
    const { startDate, endDate } = getUsageSummary.mock.calls[0][0];
    expect(startDate).toEqual(DAY_START);
    expect(endDate).toEqual(new Date("2026-10-24T23:59:59.999Z"));
  });

  it("reports the day's estimated AI cost and usage", async () => {
    await expect(service.buildSnapshot(DAY_START)).resolves.toEqual({
      cost_date: "2026-10-24",
      ai_cost_usd: 1.2346,
      ai_unpriced_call_count: 3,
      ai_call_count: 120,
      ai_total_tokens: 50_000,
    });
  });
});
