import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import { VOLUME_TIERS, VolumeTierConfig } from "./volume-tiers.constants";

/**
 * Pure plan-feature checks, shared by OrganizationsService (to tell the client)
 * and the enforcers (TrackedEmailSender, CrmPlanGuard) without coupling their
 * modules.
 */

export type PlanFeatureOrg = Pick<
  Organization,
  | "planStatus"
  | "trialEndsAt"
  | "volumeTierProductId"
  | "grandfatheredEmailTracking"
>;

/**
 * Judged from trialEndsAt as well as the status, because the lazy expiry only
 * persists 'expired' when something next touches the org.
 */
function isTrialRunning(org: PlanFeatureOrg): boolean {
  if (org.planStatus !== ORG_PLAN_STATUS.TRIAL) return false;
  if (!org.trialEndsAt) return true;
  return new Date(org.trialEndsAt).getTime() > Date.now();
}

type PlanFeatureFlag = keyof Pick<
  VolumeTierConfig,
  "includesEmailTracking" | "includesCrm"
>;

/**
 * A paid feature is available during a running trial (so people can try it),
 * on an active plan whose tier includes it, or on an active plan billed at a
 * retired Price. `grandfatheredEmailTracking` marks exactly those orgs, and
 * every retired Price (Starter $15, Growth $25) included every feature the
 * current tiers gate.
 */
function orgIncludesPlanFeature(
  org: PlanFeatureOrg,
  feature: PlanFeatureFlag,
): boolean {
  if (isTrialRunning(org)) return true;
  if (org.planStatus !== ORG_PLAN_STATUS.ACTIVE) return false;
  if (org.grandfatheredEmailTracking) return true;
  const tier = org.volumeTierProductId
    ? VOLUME_TIERS[org.volumeTierProductId]
    : undefined;
  return tier?.[feature] ?? false;
}

/** Whether the org's plan lets its members send open-tracked email. */
export function orgIncludesEmailTracking(org: PlanFeatureOrg): boolean {
  return orgIncludesPlanFeature(org, "includesEmailTracking");
}

/** Whether the org's plan includes the CRM (Growth $15/mo and up). */
export function orgIncludesCrm(org: PlanFeatureOrg): boolean {
  return orgIncludesPlanFeature(org, "includesCrm");
}
