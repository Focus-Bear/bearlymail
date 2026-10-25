import type { PgBoss } from "pg-boss";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import {
  BusinessMetricsProcessor,
  previousUtcDayStart,
} from "./business-metrics.processor";
import { CostSnapshotService } from "./cost-snapshot.service";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

const NOW = new Date("2026-10-25T00:20:00Z");

function buildProcessor(options: {
  costEnabled: boolean;
  subscriberError?: Error;
}) {
  const subscriberSnapshot = {
    buildSnapshot: options.subscriberError
      ? jest.fn().mockRejectedValue(options.subscriberError)
      : jest.fn().mockResolvedValue({ active_subscribers_total: 4 }),
  };
  const costSnapshot = {
    enabled: () => options.costEnabled,
    buildSnapshot: jest.fn().mockResolvedValue({ total_cost_usd: 9 }),
  };
  const captureSystemEvent = jest.fn();
  const processor = new BusinessMetricsProcessor(
    {} as PgBoss,
    subscriberSnapshot as unknown as SubscriberSnapshotService,
    costSnapshot as unknown as CostSnapshotService,
    { captureSystemEvent } as unknown as ErrorTrackingService,
  );
  return { processor, subscriberSnapshot, costSnapshot, captureSystemEvent };
}

describe("previousUtcDayStart", () => {
  it("is midnight UTC of the day before", () => {
    expect(previousUtcDayStart(NOW)).toEqual(new Date("2026-10-24T00:00:00Z"));
  });
});

describe("BusinessMetricsProcessor", () => {
  it("sends the subscriber snapshot under the system subscriptions ID", async () => {
    const { processor, subscriberSnapshot, captureSystemEvent } =
      buildProcessor({ costEnabled: false });

    await processor.sendSnapshots(NOW);

    expect(subscriberSnapshot.buildSnapshot).toHaveBeenCalledWith("2026-10-24");
    expect(captureSystemEvent).toHaveBeenCalledTimes(1);
    expect(captureSystemEvent).toHaveBeenCalledWith(
      "subscriber_snapshot",
      "system:subscriptions",
      { active_subscribers_total: 4 },
    );
  });

  it("sends the cost snapshot only when enabled", async () => {
    const { processor, captureSystemEvent } = buildProcessor({
      costEnabled: true,
    });

    await processor.sendSnapshots(NOW);

    expect(captureSystemEvent).toHaveBeenCalledWith(
      "cost_snapshot",
      "system:costs",
      { total_cost_usd: 9 },
    );
  });

  it("still sends costs when the subscriber snapshot fails, then fails the job", async () => {
    const { processor, captureSystemEvent } = buildProcessor({
      costEnabled: true,
      subscriberError: new Error("db down"),
    });

    await expect(processor.sendSnapshots(NOW)).rejects.toThrow(
      "subscriber_snapshot",
    );
    expect(captureSystemEvent).toHaveBeenCalledWith(
      "cost_snapshot",
      "system:costs",
      { total_cost_usd: 9 },
    );
  });
});
