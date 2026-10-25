import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import {
  StripeRecurringRevenue,
  StripeService,
} from "../subscriptions/stripe.service";
import { VOLUME_TIER_IDS } from "../subscriptions/volume-tiers.constants";

/** One row of the org plan breakdown query. */
interface OrgPlanCountRow {
  planStatus: string;
  tierId: string | null;
  hasStripe: boolean;
  hasRevenueCat: boolean;
  orgCount: string;
}

/**
 * Builds the daily `subscriber_snapshot` properties: active paid orgs by tier
 * and billing source (from the org table, which the Stripe and RevenueCat
 * webhooks keep current) plus MRR read straight from Stripe.
 */
@Injectable()
export class SubscriberSnapshotService {
  private readonly logger = new Logger(SubscriberSnapshotService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepository: Repository<Organization>,
    private readonly stripeService: StripeService,
  ) {}

  async buildSnapshot(snapshotDate: string): Promise<Record<string, unknown>> {
    const rows = await this.countOrgsByPlan();
    return {
      snapshot_date: snapshotDate,
      ...this.summariseOrgPlans(rows),
      ...this.revenueProperties(await this.readStripeRevenue()),
    };
  }

  private countOrgsByPlan(): Promise<OrgPlanCountRow[]> {
    return this.orgRepository
      .createQueryBuilder("org")
      .select("org.planStatus", "planStatus")
      .addSelect("org.volumeTierProductId", "tierId")
      .addSelect("org.stripeSubscriptionId IS NOT NULL", "hasStripe")
      .addSelect("org.revenueCatOrgSubscriptionId IS NOT NULL", "hasRevenueCat")
      .addSelect("COUNT(*)", "orgCount")
      .groupBy("org.planStatus")
      .addGroupBy("org.volumeTierProductId")
      .addGroupBy('"hasStripe"')
      .addGroupBy('"hasRevenueCat"')
      .getRawMany<OrgPlanCountRow>();
  }

  private summariseOrgPlans(rows: OrgPlanCountRow[]): Record<string, number> {
    const summary: Record<string, number> = {
      active_subscribers_total: 0,
      active_subscribers_stripe: 0,
      active_subscribers_revenuecat: 0,
      // Admin grants, promo codes and complimentary access: active, unbilled.
      active_subscribers_unbilled: 0,
      trial_orgs: 0,
    };
    for (const tierId of Object.values(VOLUME_TIER_IDS)) {
      summary[`active_subscribers_${tierId}`] = 0;
    }
    for (const row of rows) {
      const orgCount = Number(row.orgCount) || 0;
      if (row.planStatus === ORG_PLAN_STATUS.TRIAL) {
        summary.trial_orgs += orgCount;
      }
      if (row.planStatus !== ORG_PLAN_STATUS.ACTIVE || !row.tierId) continue;
      summary.active_subscribers_total += orgCount;
      const tierKey = `active_subscribers_${row.tierId}`;
      summary[tierKey] = (summary[tierKey] ?? 0) + orgCount;
      summary[this.billingSourceKey(row)] += orgCount;
    }
    return summary;
  }

  private billingSourceKey(row: OrgPlanCountRow): string {
    if (row.hasStripe) return "active_subscribers_stripe";
    if (row.hasRevenueCat) return "active_subscribers_revenuecat";
    return "active_subscribers_unbilled";
  }

  /** Stripe failures must not lose the subscriber counts, so they become null. */
  private async readStripeRevenue(): Promise<StripeRecurringRevenue | null> {
    try {
      return await this.stripeService.getRecurringRevenue();
    } catch (err) {
      this.logger.error("Could not read MRR from Stripe", err);
      return null;
    }
  }

  private revenueProperties(
    revenue: StripeRecurringRevenue | null,
  ): Record<string, number | null> {
    return {
      stripe_mrr_usd: revenue ? Number(revenue.mrrUsd.toFixed(2)) : null,
      stripe_paying_subscriptions: revenue?.payingSubscriptionCount ?? null,
      stripe_mrr_excluded_items: revenue?.excludedItemCount ?? null,
    };
  }
}
