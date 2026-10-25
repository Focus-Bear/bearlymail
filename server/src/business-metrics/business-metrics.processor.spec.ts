import type { PgBoss } from "pg-boss";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { AiCostSnapshotService } from "./ai-cost-snapshot.service";
import {
  BusinessMetricsProcessor,
  previousUtcDayStart,
} from "./business-metrics.processor";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

const NOW = new Date("2026-10-25T00:20:00Z");

function buildProcessor(subscriberError?: Error) {
  const subscriberSnapshot = {
    buildSnapshot: subscriberError
      ? jest.fn().mockRejectedValue(subscriberError)
      : jest.fn().mockResolvedValue({ active_subscribers_total: 4 }),
  };
  const aiCostSnapshot = {
    buildSnapshot: jest.fn().mockResolvedValue({ ai_cost_usd: 9 }),
  };
  const captureSystemEvent = jest.fn();
  const processor = new BusinessMetricsProcessor(
    {} as PgBoss,
    subscriberSnapshot as unknown as SubscriberSnapshotService,
    aiCostSnapshot as unknown as AiCostSnapshotService,
    { captureSystemEvent } as unknown as ErrorTrackingService,
  );
  return { processor, subscriberSnapshot, aiCostSnapshot, captureSystemEvent };
}

describe("previousUtcDayStart", () => {
  it("is midnight UTC of the day before", () => {
    expect(previousUtcDayStart(NOW)).toEqual(new Date("2026-10-24T00:00:00Z"));
  });
});

describe("BusinessMetricsProcessor", () => {
  it("sends both snapshots for the previous UTC day under their system IDs", async () => {
    const {
      processor,
      subscriberSnapshot,
      aiCostSnapshot,
      captureSystemEvent,
    } = buildProcessor();

    await processor.sendSnapshots(NOW);

    expect(subscriberSnapshot.buildSnapshot).toHaveBeenCalledWith("2026-10-24");
    expect(aiCostSnapshot.buildSnapshot).toHaveBeenCalledWith(
      new Date("2026-10-24T00:00:00Z"),
    );
    expect(captureSystemEvent).toHaveBeenCalledWith(
      "subscriber_snapshot",
      "system:subscriptions",
      { active_subscribers_total: 4 },
    );
    expect(captureSystemEvent).toHaveBeenCalledWith(
      "ai_cost_snapshot",
      "system:ai_costs",
      { ai_cost_usd: 9 },
    );
  });

  it("still sends AI cost when the subscriber snapshot fails, then fails the job", async () => {
    const { processor, captureSystemEvent } = buildProcessor(
      new Error("db down"),
    );

    await expect(processor.sendSnapshots(NOW)).rejects.toThrow(
      "subscriber_snapshot",
    );
    expect(captureSystemEvent).toHaveBeenCalledTimes(1);
    expect(captureSystemEvent).toHaveBeenCalledWith(
      "ai_cost_snapshot",
      "system:ai_costs",
      { ai_cost_usd: 9 },
    );
  });
});
