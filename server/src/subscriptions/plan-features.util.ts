import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import { VOLUME_TIERS } from "./volume-tiers.constants";

/**
 * Pure plan-feature checks, shared by OrganizationsService (to tell the client)
 * and TrackedEmailSender (to enforce) without coupling their modules.
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

/**
 * Whether the org's plan lets its members send open-tracked email: a running
 * trial (so people can try it), an active Growth/Enterprise plan, or an active
 * plan grandfathered from a price that included it.
 */
export function orgIncludesEmailTracking(org: PlanFeatureOrg): boolean {
  if (isTrialRunning(org)) return true;
  if (org.planStatus !== ORG_PLAN_STATUS.ACTIVE) return false;
  if (org.grandfatheredEmailTracking) return true;
  const tier = org.volumeTierProductId
    ? VOLUME_TIERS[org.volumeTierProductId]
    : undefined;
  return tier?.includesEmailTracking ?? false;
}
