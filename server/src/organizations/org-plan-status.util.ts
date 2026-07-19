import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import { Organization } from "../database/entities/organization.entity";
import {
  FREE_TIER_EMAIL_LIMIT,
  TRIAL_DURATION_DAYS,
} from "../subscriptions/volume-tiers.constants";

/**
 * Pure helpers for the org plan-status lifecycle, shared by
 * OrganizationsService and SubscriptionsService without coupling their
 * NestJS modules (mirrors the volume-tiers.constants extraction).
 */

/** Returns when a trial starting now should end. */
export function computeTrialEndDate(from: Date = new Date()): Date {
  const ends = new Date(from);
  ends.setDate(ends.getDate() + TRIAL_DURATION_DAYS);
  return ends;
}

/**
 * Applies the lazy trial-expiry transition in place: a trial whose
 * trialEndsAt has passed becomes 'expired' and drops to the free-tier email
 * limit. maxSeats is deliberately left untouched so the owner keeps access.
 * Returns true when the org was mutated — the caller must persist it.
 */
export function applyTrialExpiryIfDue(org: Organization): boolean {
  if (org.planStatus !== ORG_PLAN_STATUS.TRIAL) return false;
  if (!org.trialEndsAt) return false;
  if (new Date(org.trialEndsAt).getTime() > Date.now()) return false;

  org.planStatus = ORG_PLAN_STATUS.EXPIRED;
  org.emailVolumeLimit = FREE_TIER_EMAIL_LIMIT;
  return true;
}
