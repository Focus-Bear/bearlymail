/**
 * Stripe (direct) billing constants.
 *
 * BearlyMail sells subscriptions on the web directly through Stripe Hosted
 * Checkout. Volume tiers are still keyed by the stable slugs in
 * {@link VOLUME_TIERS} (`bearlymail_starter|growth|enterprise`) — those slugs
 * remain the source of truth for email-volume limits. Each slug maps to a
 * Stripe recurring Price ID supplied via env, so pricing lives in the Stripe
 * dashboard, not in code.
 */

/** Env var names for the Stripe secret + webhook signing secret. */
export const STRIPE_ENV = {
  SECRET_KEY: "STRIPE_SECRET_KEY",
  WEBHOOK_SECRET: "STRIPE_WEBHOOK_SECRET",
} as const;

/**
 * Tier slug → env var holding that tier's Stripe recurring Price ID.
 * Keys MUST match the slugs in {@link VOLUME_TIERS}.
 */
export const STRIPE_PRICE_ENV_BY_TIER: Record<string, string> = {
  bearlymail_starter: "STRIPE_PRICE_STARTER",
  bearlymail_growth: "STRIPE_PRICE_GROWTH",
  bearlymail_enterprise: "STRIPE_PRICE_ENTERPRISE",
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
