import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { orgIncludesEmailTracking, PlanFeatureOrg } from "./plan-features.util";

const HOUR_MS = 60 * 60 * 1000;

const org = (overrides: Partial<PlanFeatureOrg>): PlanFeatureOrg => ({
  planStatus: ORG_PLAN_STATUS.ACTIVE,
  trialEndsAt: null,
  volumeTierProductId: null,
  grandfatheredEmailTracking: false,
  ...overrides,
});

describe("orgIncludesEmailTracking", () => {
  it.each([
    ["bearlymail_starter", false],
    ["bearlymail_growth", true],
    ["bearlymail_enterprise", true],
    ["unknown_tier", false],
  ])("on an active %s plan → %s", (tier, expected) => {
    expect(orgIncludesEmailTracking(org({ volumeTierProductId: tier }))).toBe(
      expected,
    );
  });

  it("keeps tracking for a Starter org grandfathered from the old price", () => {
    expect(
      orgIncludesEmailTracking(
        org({
          volumeTierProductId: "bearlymail_starter",
          grandfatheredEmailTracking: true,
        }),
      ),
    ).toBe(true);
  });

  it("does not keep a grandfathered feature once the plan has lapsed", () => {
    expect(
      orgIncludesEmailTracking(
        org({
          planStatus: ORG_PLAN_STATUS.EXPIRED,
          volumeTierProductId: "bearlymail_starter",
          grandfatheredEmailTracking: true,
        }),
      ),
    ).toBe(false);
  });

  it("includes tracking during a running trial", () => {
    expect(
      orgIncludesEmailTracking(
        org({
          planStatus: ORG_PLAN_STATUS.TRIAL,
          trialEndsAt: new Date(Date.now() + HOUR_MS),
        }),
      ),
    ).toBe(true);
  });

  it("excludes tracking once the trial has elapsed, even before expiry is persisted", () => {
    expect(
      orgIncludesEmailTracking(
        org({
          planStatus: ORG_PLAN_STATUS.TRIAL,
          trialEndsAt: new Date(Date.now() - HOUR_MS),
        }),
      ),
    ).toBe(false);
  });

  it.each([ORG_PLAN_STATUS.UNPAID, ORG_PLAN_STATUS.EXPIRED])(
    "excludes tracking on a %s org",
    (planStatus) => {
      expect(
        orgIncludesEmailTracking(
          org({ planStatus, volumeTierProductId: "bearlymail_growth" }),
        ),
      ).toBe(false);
    },
  );
});
