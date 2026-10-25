/**
 * PostHog events the server emits for business metrics. Reports query these
 * exact values, so never rename a value — only the code references.
 */
export const BUSINESS_ANALYTICS_EVENTS = {
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_PLAN_CHANGED: "subscription_plan_changed",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",
  SUBSCRIBER_SNAPSHOT: "subscriber_snapshot",
  COST_SNAPSHOT: "cost_snapshot",
} as const;

/**
 * Non-person distinct IDs for company-level snapshots. Events sent under these
 * carry `$process_person_profile: false`, so they never create a PostHog person
 * and never appear in user counts, funnels or retention.
 */
export const SYSTEM_DISTINCT_IDS = {
  SUBSCRIPTIONS: "system:subscriptions",
  COSTS: "system:costs",
} as const;

export type SystemDistinctId =
  (typeof SYSTEM_DISTINCT_IDS)[keyof typeof SYSTEM_DISTINCT_IDS];

/** PostHog property that stops an event creating or updating a person profile. */
export const POSTHOG_PROCESS_PERSON_PROFILE = "$process_person_profile";

/** Values of the `billing_provider` property on subscription lifecycle events. */
export const BILLING_PROVIDERS = {
  STRIPE: "stripe",
} as const;

/** Values of the `reason` property on `subscription_cancelled`. */
export const SUBSCRIPTION_CANCEL_REASONS = {
  DELETED: "subscription_deleted",
  NOT_LIVE: "subscription_not_live",
} as const;
