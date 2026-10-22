import { VOLUME_TIER_IDS } from "./volume-tiers.constants";

/**
 * Stripe (direct) billing constants.
 *
 * BearlyMail sells subscriptions on the web directly through Stripe Hosted
 * Checkout. Volume tiers are still keyed by the stable slugs in
 * {@link VOLUME_TIERS} (`bearlymail_starter|growth|enterprise`) — those slugs
 * remain the source of truth for email-volume limits. Each slug maps to a
 * Stripe recurring Price ID supplied via env: the amount charged lives in the
 * Stripe dashboard, and the list price shown in the plan picker
 * (VOLUME_TIERS) must match it.
 */

/** Env var names for the Stripe secret + webhook signing secret. */
export const STRIPE_ENV = {
  SECRET_KEY: "STRIPE_SECRET_KEY",
  WEBHOOK_SECRET: "STRIPE_WEBHOOK_SECRET",
} as const;

/**
 * Tier slug → env var holding the Stripe recurring Price ID that NEW checkouts
 * for that tier use. Keys MUST match the slugs in {@link VOLUME_TIERS}, and
 * each Price's amount must match that tier's list price there.
 *
 * Stripe Price amounts are immutable, so a price change means a new Price:
 * put its ID in these same env vars (the infra stack injects exactly these
 * keys, and a key missing from the secret stops the web task starting) and
 * move the Price it replaces to {@link STRIPE_LEGACY_PRICE_ENV_BY_TIER}.
 */
export const STRIPE_PRICE_ENV_BY_TIER: Record<string, string> = {
  [VOLUME_TIER_IDS.STARTER]: "STRIPE_PRICE_STARTER",
  [VOLUME_TIER_IDS.GROWTH]: "STRIPE_PRICE_GROWTH",
  [VOLUME_TIER_IDS.ENTERPRISE]: "STRIPE_PRICE_ENTERPRISE",
};

/**
 * Optional: retired Prices that existing subscribers are still billed on
 * (Starter $15/mo, Growth $25/mo). Never offered at checkout. Webhooks already
 * map an unknown Price to its tier via the subscription's `tierId` metadata;
 * setting these only keeps Organization.grandfatheredEmailTracking for those
 * subscribers. Unset is fine when nobody is on a retired Price.
 */
export const STRIPE_LEGACY_PRICE_ENV_BY_TIER: Record<string, string> = {
  [VOLUME_TIER_IDS.STARTER]: "STRIPE_PRICE_STARTER_LEGACY",
  [VOLUME_TIER_IDS.GROWTH]: "STRIPE_PRICE_GROWTH_LEGACY",
};

/** Stripe webhook event types we handle. */
export const STRIPE_WEBHOOK_EVENTS = {
  CHECKOUT_COMPLETED: "checkout.session.completed",
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",
  INVOICE_PAID: "invoice.paid",
} as const;

/** Stripe subscription statuses that mean the plan is live and paid. */
export const STRIPE_LIVE_SUB_STATUSES = ["active", "trialing"];

/** Stripe `invoice.billing_reason` value for a recurring renewal (cycle reset). */
export const STRIPE_BILLING_REASON_CYCLE = "subscription_cycle";
