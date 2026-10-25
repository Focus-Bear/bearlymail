/**
 * PostHog events the server emits for business metrics. Reports query these
 * exact values, so never rename a value — only the code references.
 */
export const BUSINESS_ANALYTICS_EVENTS = {
  // Same event the client sends for email sign-ups, so one query counts all.
  USER_REGISTERED: "user_registered",
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_PLAN_CHANGED: "subscription_plan_changed",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",
  SUBSCRIBER_SNAPSHOT: "subscriber_snapshot",
  AI_COST_SNAPSHOT: "ai_cost_snapshot",
} as const;

/**
 * Non-person distinct IDs for company-level snapshots. Events sent under these
 * carry `$process_person_profile: false`, so they never create a PostHog person
 * and never appear in user counts, funnels or retention.
 */
export const SYSTEM_DISTINCT_IDS = {
  SUBSCRIPTIONS: "system:subscriptions",
  AI_COSTS: "system:ai_costs",
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

/**
 * Values of the `method` property on `user_registered`. They match the client's
 * LOGIN_METHODS; the client sends the email sign-ups itself.
 */
export const REGISTRATION_METHODS = {
  GOOGLE: "google",
  MICROSOFT: "microsoft",
  ZOHO: "zoho",
} as const;

export type RegistrationMethod =
  (typeof REGISTRATION_METHODS)[keyof typeof REGISTRATION_METHODS];
