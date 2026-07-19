/**
 * Phishing detection service.
 *
 * Analyses an email for common phishing indicators:
 *  1. Domain mismatch – the sender's domain does not match domains linked in the body
 *  2. Suspicious body content – urgent language, credential harvesting phrases, etc.
 *
 * Primary API:
 *  - extractPhishingSignals(): structured signal extraction for LLM context injection
 *
 * Deprecated (signals only, NOT verdicts):
 *  - detectPhishingSignal(): keyword-only heuristic — kept for reference/testing only.
 *    This function is NO LONGER used as a fallback verdict path. If the LLM fails,
 *    the phishing result is null (fail-safe). Keyword signals feed the LLM prompt only.
 */

import { PHISHING_CONFIDENCE } from "../constants/domain-types";

export type PhishingConfidence = "low" | "medium" | "high";

export interface PhishingSignal {
  /** How confident we are that this is a phishing attempt */
  confidence: PhishingConfidence;
  /** Human-readable reason shown in the UI */
  reason: string;
}

/**
 * Structured keyword/domain signals extracted from an email.
 * These are passed as context to the LLM summarisation prompt so the LLM
 * can make a more informed phishing verdict. The LLM always decides — these
 * signals do NOT gate whether LLM analysis runs.
 */
export interface PhishingSignals {
  /** True when the sender domain doesn't match any linked domain in the body */
  hasDomainMismatch: boolean;
  /** The domain extracted from the sender's "from" address, or null if unparseable */
  senderDomain: string | null;
  /** All unique hostnames found in body URLs */
  linkedDomains: string[];
  /** Which suspicious keyword patterns were matched (human-readable labels) */
  suspiciousKeywords: string[];
  /** Raw numeric score (for logging/debugging only — NOT used as a gate) */
  rawScore: number;
}

/**
 * The phishing verdict returned by the LLM as part of the summarisation response.
 */
export interface PhishingLLMResult {
  is_phishing: boolean;
  confidence: PhishingConfidence;
  reason: string;
}

const REGISTERED_DOMAIN_PARTS = -2;
const HIGH_CONFIDENCE_THRESHOLD = 6;

/**
 * Well-known domains that are commonly linked in legitimate emails.
 * These are excluded from domain-mismatch checks because nearly every
 * business email links to at least one of these services.
 */
const TRUSTED_LINK_DOMAINS = new Set([
  "google.com",
  "youtube.com",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "microsoft.com",
  "office.com",
  "outlook.com",
  "apple.com",
  "amazon.com",
  "zoom.us",
  "slack.com",
  "notion.so",
  "figma.com",
  "dropbox.com",
  "atlassian.com",
  "jira.com",
  "confluence.com",
  "trello.com",
  "hubspot.com",
  "mailchimp.com",
  "sendgrid.net",
  "stripe.com",
  "intercom.io",
  "calendly.com",
  "loom.com",
  "miro.com",
  "canva.com",
  "airtable.com",
  "typeform.com",
  "surveymonkey.com",
  "docusign.com",
  "cloudflare.com",
  "amazonaws.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "github.io",
  "githubusercontent.com",
  "wp.com",
  "wordpress.com",
  "medium.com",
  "substack.com",
]);

const CONFIDENCE_LEVELS: Record<PhishingConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Safe fallback: if parsing or detection throws, return null (no signal).
 */
export function validatePhishingConfidence(
  value: unknown,
): PhishingConfidence | null {
  if (
    value === PHISHING_CONFIDENCE.LOW ||
    value === PHISHING_CONFIDENCE.MEDIUM ||
    value === PHISHING_CONFIDENCE.HIGH
  ) {
    return value;
  }
  return null;
}

/**
 * Extract the domain portion from an email address or "Name <email>" string.
 */
function extractSenderDomain(from: string | undefined): string | null {
  if (!from) return null;
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([^\s]+)/);
  const email = emailMatch ? emailMatch[1] : null;
  if (!email) return null;
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[1].trim() : null;
}

/**
 * Extract all unique hostnames mentioned in URLs inside the email body.
 */
function extractBodyDomains(body: string): Set<string> {
  const domains = new Set<string>();
  // Match http/https URLs
  const urlRegex = /https?:\/\/([^/\s"'<>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(body)) !== null) {
    // Strip port numbers
    const host = match[1].split(":")[0].toLowerCase();
    if (host) domains.add(host);
  }
  return domains;
}

/**
 * Returns true when none of the body domains share a registered domain with the sender.
 * We compare the last two parts of the hostname (e.g. "paypal.com" from "secure.paypal.com").
 *
 * Trusted well-known domains (e.g. google.com, github.com) are excluded from the check
 * because nearly every legitimate business email links to at least one of these services.
 */
function hasDomainMismatch(
  senderDomain: string,
  bodyDomains: Set<string>,
): boolean {
  if (bodyDomains.size === 0) return false;

  const registeredDomain = (host: string) =>
    host.split(".").slice(REGISTERED_DOMAIN_PARTS).join(".");

  const senderRegistered = registeredDomain(senderDomain);

  // Filter out trusted/well-known domains before checking for mismatches
  const untrustedDomains = [...bodyDomains].filter(
    (domain) => !TRUSTED_LINK_DOMAINS.has(registeredDomain(domain)),
  );

  // If all linked domains are trusted, there's no mismatch to report
  if (untrustedDomains.length === 0) return false;

  for (const domain of untrustedDomains) {
    if (registeredDomain(domain) === senderRegistered) {
      // At least one untrusted domain matches the sender — not a mismatch
      return false;
    }
  }
  return true;
}

/** Suspicious phrases commonly found in phishing emails */
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /verify\s+your\s+(account|identity|email|password)/i, weight: 2 },
  { pattern: /confirm\s+your\s+(account|identity|email|password)/i, weight: 2 },
  {
    pattern: /update\s+your\s+(payment|billing|credit\s+card|bank)/i,
    weight: 2,
  },
  {
    pattern:
      /your\s+account\s+(has\s+been|will\s+be)\s+(suspended|locked|disabled|closed)/i,
    weight: 3,
  },
  {
    pattern: /click\s+(here|below)\s+(to\s+)?(verify|confirm|update|restore)/i,
    weight: 2,
  },
  { pattern: /unusual\s+(activity|sign-?in|access)/i, weight: 2 },
  { pattern: /immediately|urgent(ly)?|act\s+now/i, weight: 1 },
  { pattern: /prize|you\s+(have\s+)?won|lottery|winner/i, weight: 2 },
  {
    pattern: /enter\s+your\s+(password|pin|ssn|social\s+security)/i,
    weight: 3,
  },
  { pattern: /limited\s+time\s+offer/i, weight: 1 },
];

/**
 * Compute a suspicion score from the email body based on known phishing phrases.
 */
function computeSuspicionScore(body: string): number {
  return SUSPICIOUS_PATTERNS.reduce(
    (score, { pattern, weight }) =>
      pattern.test(body) ? score + weight : score,
    0,
  );
}

/**
 * Extract which suspicious keyword labels were matched in the body.
 * Returns human-readable labels rather than raw regex patterns.
 */
function extractSuspiciousKeywordLabels(body: string): string[] {
  const PATTERN_LABELS: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /verify\s+your\s+(account|identity|email|password)/i,
      label: "verify account/identity",
    },
    {
      pattern: /confirm\s+your\s+(account|identity|email|password)/i,
      label: "confirm account/identity",
    },
    {
      pattern: /update\s+your\s+(payment|billing|credit\s+card|bank)/i,
      label: "update payment/billing",
    },
    {
      pattern:
        /your\s+account\s+(has\s+been|will\s+be)\s+(suspended|locked|disabled|closed)/i,
      label: "account suspended/locked",
    },
    {
      pattern:
        /click\s+(here|below)\s+(to\s+)?(verify|confirm|update|restore)/i,
      label: "click to verify/update",
    },
    {
      pattern: /unusual\s+(activity|sign-?in|access)/i,
      label: "unusual activity",
    },
    {
      pattern: /immediately|urgent(ly)?|act\s+now/i,
      label: "urgency language",
    },
    {
      pattern: /prize|you\s+(have\s+)?won|lottery|winner/i,
      label: "prize/lottery",
    },
    {
      pattern: /enter\s+your\s+(password|pin|ssn|social\s+security)/i,
      label: "credential request",
    },
    { pattern: /limited\s+time\s+offer/i, label: "limited time offer" },
  ];
  return PATTERN_LABELS.filter(({ pattern }) => pattern.test(body)).map(
    ({ label }) => label,
  );
}

/**
 * Extract structured phishing signals from an email for use as LLM context.
 * These signals help the LLM reason about whether the email is phishing,
 * but the LLM always makes the final determination — this function does NOT
 * return a verdict.
 */
export function extractPhishingSignals(
  from: string | undefined,
  body: string,
): PhishingSignals {
  const senderDomain = extractSenderDomain(from);
  const bodyDomainsSet = extractBodyDomains(body);
  const linkedDomains = [...bodyDomainsSet];
  const suspiciousKeywords = extractSuspiciousKeywordLabels(body);
  const mismatch = senderDomain
    ? hasDomainMismatch(senderDomain, bodyDomainsSet)
    : false;
  const domainWeight = mismatch ? 3 : 0;
  const keywordWeight = computeSuspicionScore(body);

  return {
    hasDomainMismatch: mismatch,
    senderDomain,
    linkedDomains,
    suspiciousKeywords,
    rawScore: domainWeight + keywordWeight,
  };
}

/**
 * Merge two PhishingSignals objects from different emails in a thread.
 * Takes the union of keywords/domains and flags mismatch if either email has one.
 */
export function mergePhishingSignalSets(
  signalA: PhishingSignals,
  signalB: PhishingSignals,
): PhishingSignals {
  const mergedDomains = [
    ...new Set([...signalA.linkedDomains, ...signalB.linkedDomains]),
  ];
  const mergedKeywords = [
    ...new Set([...signalA.suspiciousKeywords, ...signalB.suspiciousKeywords]),
  ];
  return {
    hasDomainMismatch: signalA.hasDomainMismatch || signalB.hasDomainMismatch,
    senderDomain: signalA.senderDomain ?? signalB.senderDomain,
    linkedDomains: mergedDomains,
    suspiciousKeywords: mergedKeywords,
    rawScore: Math.max(signalA.rawScore, signalB.rawScore),
  };
}

/**
 * @deprecated No longer used as a phishing verdict path.
 * Keyword/heuristic signals are fed to the LLM as context only — they never produce
 * standalone phishing alerts. If the LLM fails, the result is null (fail-safe).
 * Kept here for reference and unit tests. Do NOT call this in production verdict paths.
 *
 * Analyse an email and return a PhishingSignal if suspicious,
 * or null if the email looks clean.
 */
export function detectPhishingSignal(
  from: string | undefined,
  body: string,
): PhishingSignal | null {
  const reasons: string[] = [];
  let totalWeight = 0;

  const senderDomain = extractSenderDomain(from);
  const bodyDomains = extractBodyDomains(body);

  // --- Check 1: domain mismatch ---
  if (senderDomain && hasDomainMismatch(senderDomain, bodyDomains)) {
    reasons.push(
      `Sender domain (${senderDomain}) does not match link domains in body (${[...bodyDomains].slice(0, 3).join(", ")})`,
    );
    totalWeight += 3;
  }

  // --- Check 2: suspicious body content ---
  const suspicionScore = computeSuspicionScore(body);
  if (suspicionScore >= 1) {
    reasons.push("Email body contains common phishing language");
    totalWeight += suspicionScore;
  }

  if (totalWeight === 0) return null;

  let confidence: PhishingConfidence;
  if (totalWeight >= HIGH_CONFIDENCE_THRESHOLD) {
    confidence = "high";
  } else if (totalWeight >= 3) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Suppress very low-confidence signals that only triggered one minor phrase
  if (
    confidence === PHISHING_CONFIDENCE.LOW &&
    reasons.length === 1 &&
    suspicionScore <= 1
  ) {
    return null;
  }

  return {
    confidence,
    reason: reasons.join("; "),
  };
}

/**
 * Common second-level domains used in multi-part public suffixes (e.g. ".co.uk",
 * ".com.br"). When a sender's domain ends in one of these, the registered brand
 * label is the third-to-last part, not the second-to-last.
 */
const MULTI_PART_TLD_SLDS = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "edu",
  "ac",
]);

/**
 * Extract the registered brand label from a hostname, handling common multi-part
 * public suffixes. For "amazon.co.uk" returns "amazon"; for "mail.esmsolutions.com"
 * returns "esmsolutions". Falls back to the original hostname when extraction fails.
 */
function extractDomainLabel(senderDomain: string): string {
  const parts = senderDomain.split(".");
  const isMultiPartTld =
    parts.length >= 3 && MULTI_PART_TLD_SLDS.has(parts[parts.length - 2]);
  const labelIndex = isMultiPartTld ? parts.length - 3 : parts.length - 2;
  return parts[labelIndex] ?? senderDomain;
}

/**
 * Result of comparing a sender's display name against their actual email domain.
 * Used for debugging brand-impersonation phishing (e.g. display name "SendGrid"
 * sent from noreply@esmsolutions.com). This signal is NOT yet wired into the
 * production verdict path — it is surfaced in the admin phishing debug panel only.
 */
export interface DisplayNameDomainCheck {
  /** True when the display name doesn't appear to relate to the sender's domain */
  mismatch: boolean;
  displayName: string | null;
  senderDomain: string | null;
  /** Human-readable explanation of the verdict */
  detail: string;
}

/**
 * Detect when a sender's display name looks unrelated to their actual email domain
 * — a common brand-impersonation phishing pattern that the domain-link and keyword
 * checks miss entirely.
 *
 * Compares the registered domain label (e.g. "esmsolutions" from "mail.esmsolutions.com")
 * against the alphanumeric-normalised display name. If neither contains the other, the
 * names are considered unrelated. This is a coarse heuristic intended for debugging,
 * so it will flag legitimate personal-name senders too — it is a signal, not a verdict.
 */
export function detectDisplayNameDomainMismatch(
  fromName: string | null | undefined,
  senderDomain: string | null,
): DisplayNameDomainCheck {
  const displayName = fromName?.trim() || null;
  if (!displayName || !senderDomain) {
    return {
      mismatch: false,
      displayName,
      senderDomain,
      detail: "Insufficient data (missing display name or sender domain)",
    };
  }

  const domainLabel = extractDomainLabel(senderDomain);
  const normalizedName = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedDomain = domainLabel.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!normalizedName || !normalizedDomain) {
    return {
      mismatch: false,
      displayName,
      senderDomain,
      detail:
        "Insufficient data (display name or domain has no comparable text)",
    };
  }

  const related =
    normalizedDomain.includes(normalizedName) ||
    normalizedName.includes(normalizedDomain);

  return {
    mismatch: !related,
    displayName,
    senderDomain,
    detail: related
      ? `Display name "${displayName}" matches sender domain "${senderDomain}"`
      : `Display name "${displayName}" does not appear in sender domain "${senderDomain}" — possible brand impersonation`,
  };
}

/**
 * Pick the stronger of two PhishingSignals (useful when aggregating thread signals).
 */
export function mergePhishingSignals(
  itemA: PhishingSignal | null,
  itemB: PhishingSignal | null,
): PhishingSignal | null {
  if (!itemA) return itemB;
  if (!itemB) return itemA;
  return CONFIDENCE_LEVELS[itemA.confidence] >=
    CONFIDENCE_LEVELS[itemB.confidence]
    ? itemA
    : itemB;
}
