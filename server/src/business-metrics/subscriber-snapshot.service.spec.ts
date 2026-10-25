import { Repository } from "typeorm";

import { Organization } from "../database/entities/organization.entity";
import { StripeService } from "../subscriptions/stripe.service";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

const row = (
  planStatus: string,
  tierId: string | null,
  orgCount: number,
  billing: { hasStripe?: boolean; hasRevenueCat?: boolean } = {},
) => ({
  planStatus,
  tierId,
  hasStripe: billing.hasStripe ?? false,
  hasRevenueCat: billing.hasRevenueCat ?? false,
  orgCount: String(orgCount),
});

function buildService(
  rows: unknown[],
  getRecurringRevenue: jest.Mock,
): SubscriberSnapshotService {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const orgRepository = { createQueryBuilder: () => queryBuilder };
  return new SubscriberSnapshotService(
    orgRepository as unknown as Repository<Organization>,
    { getRecurringRevenue } as unknown as StripeService,
  );
}

describe("SubscriberSnapshotService", () => {
  it("counts active paid orgs by tier and billing source", async () => {
    const service = buildService(
      [
        row("active", "bearlymail_starter", 3, { hasStripe: true }),
        row("active", "bearlymail_growth", 2, { hasStripe: true }),
        row("active", "bearlymail_growth", 1, { hasRevenueCat: true }),
        row("active", "bearlymail_enterprise", 1),
        row("trial", null, 7),
        row("expired", null, 4),
        // Active with no tier is not a paid plan.
        row("active", null, 5),
      ],
      jest.fn().mockResolvedValue({
        mrrUsd: 45.004,
        payingSubscriptionCount: 5,
        excludedItemCount: 0,
      }),
    );

    const snapshot = await service.buildSnapshot("2026-10-24");

    expect(snapshot).toMatchObject({
      snapshot_date: "2026-10-24",
      active_subscribers_total: 7,
      active_subscribers_bearlymail_starter: 3,
      active_subscribers_bearlymail_growth: 3,
      active_subscribers_bearlymail_enterprise: 1,
      active_subscribers_stripe: 5,
      active_subscribers_revenuecat: 1,
      active_subscribers_unbilled: 1,
      trial_orgs: 7,
      stripe_mrr_usd: 45,
      stripe_paying_subscriptions: 5,
    });
  });

  it("still reports counts, with null MRR, when Stripe fails", async () => {
    const service = buildService(
      [row("active", "bearlymail_growth", 1, { hasStripe: true })],
      jest.fn().mockRejectedValue(new Error("stripe down")),
    );

    const snapshot = await service.buildSnapshot("2026-10-24");

    expect(snapshot.active_subscribers_total).toBe(1);
    expect(snapshot.active_subscribers_bearlymail_starter).toBe(0);
    expect(snapshot.stripe_mrr_usd).toBeNull();
  });
});
