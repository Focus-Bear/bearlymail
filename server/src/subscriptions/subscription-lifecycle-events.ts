import {
  BILLING_PROVIDERS,
  BUSINESS_ANALYTICS_EVENTS,
} from "../constants/analytics-events";
import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import { VOLUME_TIERS } from "./volume-tiers.constants";

/** The paid-plan state of an org, captured before and after a billing change. */
export interface OrgPlanState {
  /** The paid tier slug while the plan is active, otherwise null. */
  activeTierId: string | null;
  planStatus: string;
}

export interface SubscriptionLifecycleEvent {
  event: string;
  properties: Record<string, unknown>;
}

/** Why a plan ended, for the `reason` / `stripe_status` properties. */
export interface PlanEndContext {
  reason: string;
  stripeStatus?: string;
}

export function captureOrgPlanState(org: Organization): OrgPlanState {
  const isActive =
    org.planStatus === ORG_PLAN_STATUS.ACTIVE && !!org.volumeTierProductId;
  return {
    activeTierId: isActive ? org.volumeTierProductId : null,
    planStatus: org.planStatus,
  };
}

const listPriceUsd = (tierId: string): number | null =>
  VOLUME_TIERS[tierId]?.price ?? null;

/**
 * Derives the subscription event (if any) from an org's plan state before and
 * after a billing webhook. Comparing states rather than webhook types keeps it
 * idempotent: Stripe retries and the overlapping checkout/updated events leave
 * the state unchanged, so they emit nothing.
 */
export function subscriptionLifecycleEvent(
  before: OrgPlanState,
  after: OrgPlanState,
  endContext?: PlanEndContext,
): SubscriptionLifecycleEvent | null {
  const common = { billing_provider: BILLING_PROVIDERS.STRIPE };
  if (!before.activeTierId && after.activeTierId) {
    return {
      event: BUSINESS_ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
      properties: {
        ...common,
        tier: after.activeTierId,
        list_price_usd: listPriceUsd(after.activeTierId),
        previous_plan_status: before.planStatus,
      },
    };
  }
  if (before.activeTierId && !after.activeTierId) {
    return {
      event: BUSINESS_ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED,
      properties: {
        ...common,
        previous_tier: before.activeTierId,
        previous_list_price_usd: listPriceUsd(before.activeTierId),
        reason: endContext?.reason ?? null,
        stripe_status: endContext?.stripeStatus ?? null,
      },
    };
  }
  if (
    before.activeTierId &&
    after.activeTierId &&
    before.activeTierId !== after.activeTierId
  ) {
    return {
      event: BUSINESS_ANALYTICS_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
      properties: {
        ...common,
        tier: after.activeTierId,
        previous_tier: before.activeTierId,
        list_price_usd: listPriceUsd(after.activeTierId),
        previous_list_price_usd: listPriceUsd(before.activeTierId),
      },
    };
  }
  return null;
}
