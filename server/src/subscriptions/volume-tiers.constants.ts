/**
 * Shared volume tier constants.
 * Extracted to a standalone file to avoid circular imports between
 * subscriptions.service and organizations.controller.
 */

export const VOLUME_TIER_NONE = "none" as const;

export const VOLUME_TIERS: Record<string, { limit: number; price: number }> = {
  bearlymail_starter: { limit: 3000, price: 10 },
  bearlymail_growth: { limit: 10000, price: 20 },
  bearlymail_business: { limit: 30000, price: 50 },
} as const;
