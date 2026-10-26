import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import {
  captureOrgPlanState,
  OrgPlanState,
  subscriptionLifecycleEvent,
} from "./subscription-lifecycle-events";

const state = (
  planStatus: string,
  activeTierId: string | null,
): OrgPlanState => ({ planStatus, activeTierId });

describe("captureOrgPlanState", () => {
  it("only reports a tier while the plan is active", () => {
    const org = {
      planStatus: ORG_PLAN_STATUS.EXPIRED,
      volumeTierProductId: "bearlymail_growth",
    } as Organization;
    expect(captureOrgPlanState(org).activeTierId).toBeNull();
    org.planStatus = ORG_PLAN_STATUS.ACTIVE;
    expect(captureOrgPlanState(org).activeTierId).toBe("bearlymail_growth");
  });
});

describe("subscriptionLifecycleEvent", () => {
  it("is a start when a paid tier becomes active", () => {
    const event = subscriptionLifecycleEvent(
      state(ORG_PLAN_STATUS.TRIAL, null),
      state(ORG_PLAN_STATUS.ACTIVE, "bearlymail_starter"),
    );
    expect(event?.event).toBe("subscription_started");
    expect(event?.properties).toMatchObject({
      tier: "bearlymail_starter",
      previous_plan_status: ORG_PLAN_STATUS.TRIAL,
    });
  });

  it("is a cancellation when the active tier ends", () => {
    const event = subscriptionLifecycleEvent(
      state(ORG_PLAN_STATUS.ACTIVE, "bearlymail_enterprise"),
      state(ORG_PLAN_STATUS.EXPIRED, null),
      { reason: "subscription_deleted" },
    );
    expect(event?.event).toBe("subscription_cancelled");
    expect(event?.properties).toMatchObject({
      previous_tier: "bearlymail_enterprise",
      reason: "subscription_deleted",
      stripe_status: null,
    });
  });

  it("is nothing when the state is unchanged", () => {
    const active = state(ORG_PLAN_STATUS.ACTIVE, "bearlymail_growth");
    expect(subscriptionLifecycleEvent(active, active)).toBeNull();
    const expired = state(ORG_PLAN_STATUS.EXPIRED, null);
    expect(subscriptionLifecycleEvent(expired, expired)).toBeNull();
  });
});
