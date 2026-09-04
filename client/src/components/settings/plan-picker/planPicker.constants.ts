/**
 * Shared constants for the plan purchase flow.
 */

/**
 * Where the Upgrade CTA points when in-app checkout is unavailable
 * (the user has no organisation the Stripe webhook could activate).
 */
export const UPGRADE_MAILTO_HREF = 'mailto:jeremy@focusbear.io?subject=BearlyMail%20upgrade';

/** Translation keys for the volume-tier slugs. */
export const TIER_NAME_KEYS: Record<string, string> = {
  bearlymail_starter: 'team.settings.tierStarter',
  bearlymail_growth: 'team.settings.tierGrowth',
  bearlymail_enterprise: 'team.settings.tierEnterprise',
};

/** How often to re-check `/organizations/usage` while waiting for the webhook. */
export const ACTIVATION_POLL_INTERVAL_MS = 3000;

/** Give up polling for activation after this long (webhook latency varies). */
export const ACTIVATION_POLL_TIMEOUT_MS = 60000;
