/**
 * Single registry of "uniform notification platforms": services that send all
 * their mail from one domain (often one address) but cover many distinct
 * notification sub-streams (a GitHub PR update vs an issue comment vs a CI
 * failure; a Jira ticket assigned vs commented; a Sentry new-issue vs
 * regression). Because the sender is uniform, sender-based categorisation and
 * deterministic sender+phrase rules cannot separate the sub-streams — the
 * `notification-subtype` resolver keys off this registry to recover a
 * finer-grained substream signal.
 *
 * Extracted from `category-shortlist.service.ts` so the shortlist pinning, the
 * subtype resolver, and downstream consumers share ONE list of platform domains
 * (and the local-model notification-subtype feature can import the same one).
 */
export interface PlatformPinningEntry {
  /** Sender email domains (matched exactly or as a parent of a sub-domain). */
  domainPatterns: string[];
  /** Category-name keywords pinned into the shortlist for this platform. */
  categoryKeywords: string[];
  /**
   * Stable identifier for the platform, used to namespace resolved notification
   * subtypes (e.g. `github:pr`). Defaults to the first category keyword.
   */
  id: string;
}

export const PLATFORM_PINNING: PlatformPinningEntry[] = [
  {
    id: "github",
    domainPatterns: ["github.com", "github.io"],
    categoryKeywords: ["github"],
  },
  {
    id: "gitlab",
    domainPatterns: ["gitlab.com", "gitlab.io"],
    categoryKeywords: ["gitlab"],
  },
  {
    id: "atlassian",
    domainPatterns: ["atlassian.net", "atlassian.com"],
    categoryKeywords: ["jira", "atlassian", "confluence"],
  },
  {
    id: "linear",
    domainPatterns: ["linear.app"],
    categoryKeywords: ["linear"],
  },
  { id: "slack", domainPatterns: ["slack.com"], categoryKeywords: ["slack"] },
  {
    id: "notion",
    domainPatterns: ["notion.so", "notion.com"],
    categoryKeywords: ["notion"],
  },
  { id: "figma", domainPatterns: ["figma.com"], categoryKeywords: ["figma"] },
  { id: "sentry", domainPatterns: ["sentry.io"], categoryKeywords: ["sentry"] },
  {
    id: "pagerduty",
    domainPatterns: ["pagerduty.com"],
    categoryKeywords: ["pagerduty"],
  },
  {
    id: "datadog",
    domainPatterns: ["datadog.com"],
    categoryKeywords: ["datadog"],
  },
];

/** True when `domain` equals a pattern or is a sub-domain of it. */
export function domainMatchesAny(domain: string, patterns: string[]): boolean {
  return patterns.some(
    (pattern) => domain === pattern || domain.endsWith(`.${pattern}`),
  );
}

/** The lowercased domain part of an email address, or null when unparseable. */
export function senderDomain(fromEmail: string | undefined): string | null {
  const address = fromEmail?.toLowerCase().match(/<([^>]+)>/)?.[1] ?? fromEmail;
  const domain = address?.toLowerCase().trim().split("@")[1];
  return domain ? domain.replace(/>+\s*$/, "").trim() : null;
}

/** Returns the platform whose domains own this sender, or null. */
export function platformForSender(
  fromEmail: string | undefined,
): PlatformPinningEntry | null {
  const domain = senderDomain(fromEmail);
  if (!domain) return null;
  return (
    PLATFORM_PINNING.find((entry) =>
      domainMatchesAny(domain, entry.domainPatterns),
    ) ?? null
  );
}

/**
 * Domain patterns that mark a sender as GitHub, sourced from the registry so
 * there is a single source of truth for GitHub domains.
 */
export const GITHUB_SENDER_DOMAINS: string[] = PLATFORM_PINNING.find(
  (entry) => entry.id === "github",
)?.domainPatterns ?? ["github.com", "github.io"];

/** True when the sender's email address is on a GitHub domain. */
export function isGithubSenderEmail(fromEmail: string | undefined): boolean {
  const domain = senderDomain(fromEmail);
  if (!domain) return false;
  return domainMatchesAny(domain, GITHUB_SENDER_DOMAINS);
}
