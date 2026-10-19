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

/** Stable tier slugs (the keys of {@link VOLUME_TIERS}). */
export const VOLUME_TIER_IDS = {
  STARTER: "bearlymail_starter",
  GROWTH: "bearlymail_growth",
  ENTERPRISE: "bearlymail_enterprise",
} as const;

/** Seats an org has with no paid plan (the owner alone). */
export const FREE_TIER_SEATS = 1;

export interface VolumeTierConfig {
  /** AI-processed emails per billing cycle. */
  limit: number;
  /** List price in USD per month, as shown in the plan picker. */
  price: number;
  /** Team members (including the owner) the plan pays for. */
  seats: number;
  /** Whether outgoing mail can carry an open-tracking pixel. */
  includesEmailTracking: boolean;
}

// These list prices are what the plan picker shows, so they must match the
// amounts of the Stripe Prices new checkouts use (see
// STRIPE_PRICE_ENV_BY_TIER). Subscribers on an older Price keep paying its
// amount; only the displayed price for new purchases changes here.
export const VOLUME_TIERS: Record<string, VolumeTierConfig> = {
  [VOLUME_TIER_IDS.STARTER]: {
    limit: 3000,
    price: 5,
    seats: FREE_TIER_SEATS,
    includesEmailTracking: false,
  },
  [VOLUME_TIER_IDS.GROWTH]: {
    limit: 10000,
    price: 15,
    seats: FREE_TIER_SEATS,
    includesEmailTracking: true,
  },
  [VOLUME_TIER_IDS.ENTERPRISE]: {
    limit: 30000,
    price: 40,
    seats: 5,
    includesEmailTracking: true,
  },
} as const;
