import { ConfigService } from "@nestjs/config";

import { TokenUsageService } from "../llm/token-usage.service";
import { CostSnapshotService } from "./cost-snapshot.service";

const DAY_START = new Date("2026-10-24T00:00:00Z");

function buildService(env: Record<string, string>) {
  const getUsageSummary = jest.fn().mockResolvedValue({
    totalCalls: 120,
    totalTokens: 50_000,
    totalEstimatedCostUsd: 1.23456,
    unpricedCallCount: 3,
  });
  const service = new CostSnapshotService(
    { getUsageSummary } as unknown as TokenUsageService,
    { get: (key: string) => env[key] } as unknown as ConfigService,
  );
  return { service, getUsageSummary };
}

describe("CostSnapshotService", () => {
  it("is off unless COST_SNAPSHOT_ENABLED is true", () => {
    expect(buildService({}).service.enabled()).toBe(false);
    expect(
      buildService({ COST_SNAPSHOT_ENABLED: "true" }).service.enabled(),
    ).toBe(true);
  });

  it("queries LLM usage for exactly the one UTC day", async () => {
    const { service, getUsageSummary } = buildService({});
    await service.buildSnapshot(DAY_START);
    const { startDate, endDate } = getUsageSummary.mock.calls[0][0];
    expect(startDate).toEqual(DAY_START);
    expect(endDate).toEqual(new Date("2026-10-24T23:59:59.999Z"));
  });

  it("adds fixed monthly costs spread per day to the LLM estimate", async () => {
    const { service } = buildService({
      COST_SNAPSHOT_FIXED_MONTHLY_USD: JSON.stringify({ aws: 365, pusher: 0 }),
    });

    const snapshot = await service.buildSnapshot(DAY_START);

    expect(snapshot).toMatchObject({
      cost_date: "2026-10-24",
      currency: "USD",
      llm_estimated_cost_usd: 1.2346,
      llm_unpriced_call_count: 3,
      llm_call_count: 120,
      fixed_cost_aws_usd: 12,
      fixed_cost_pusher_usd: 0,
      fixed_costs_total_usd: 12,
      total_cost_usd: 13.2346,
    });
  });

  it("skips invalid fixed-cost entries and malformed JSON", async () => {
    const invalidEntries = buildService({
      COST_SNAPSHOT_FIXED_MONTHLY_USD: JSON.stringify({
        aws: 365,
        "Bad Key": 10,
        negative: -5,
        text: "50",
      }),
    });
    const entries = await invalidEntries.service.buildSnapshot(DAY_START);
    expect(entries.fixed_costs_total_usd).toBe(12);
    expect(Object.keys(entries)).not.toContain("fixed_cost_negative_usd");

    const malformed = buildService({ COST_SNAPSHOT_FIXED_MONTHLY_USD: "{" });
    const snapshot = await malformed.service.buildSnapshot(DAY_START);
    expect(snapshot.fixed_costs_total_usd).toBe(0);
    expect(snapshot.total_cost_usd).toBe(1.2346);
  });
});
