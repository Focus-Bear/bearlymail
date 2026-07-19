/**
 * Shared volume tier constants.
 * Extracted to a standalone file to avoid circular imports between
 * subscriptions.service and organizations.controller.
 *
 * Keys are RevenueCat **entitlement identifiers** (stable slugs), not store
 * product IDs — the purchasable products carry platform SKUs (e.g. Stripe
 * `prod_...`), so the tier is resolved from the granted entitlement instead.
 */

export const VOLUME_TIER_NONE = "none" as const;

/** Emails per cycle that still get AI processing on the free (unpaid/expired) tier. */
export const FREE_TIER_EMAIL_LIMIT = 100;

/** Emails per cycle during the free trial (matches the starter tier). */
export const TRIAL_EMAIL_LIMIT = 3000;

/** Length of the free org trial, in days. */
export const TRIAL_DURATION_DAYS = 7;

export const VOLUME_TIERS: Record<string, { limit: number; price: number }> = {
  bearlymail_starter: { limit: 3000, price: 10 },
  bearlymail_growth: { limit: 10000, price: 20 },
  bearlymail_enterprise: { limit: 30000, price: 50 },
} as const;
