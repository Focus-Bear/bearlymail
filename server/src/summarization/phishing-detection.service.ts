/**
 * Phishing detection service.
 *
 * Analyses an email for common phishing indicators:
 *  1. Domain mismatch – the sender's domain does not match domains linked in the body
 *  2. Suspicious body content – urgent language, credential harvesting phrases, etc.
 */

export type PhishingConfidence = "low" | "medium" | "high";

export interface PhishingSignal {
  /** How confident we are that this is a phishing attempt */
  confidence: PhishingConfidence;
  /** Human-readable reason shown in the UI */
  reason: string;
}

const REGISTERED_DOMAIN_PARTS = -2;
const HIGH_CONFIDENCE_THRESHOLD = 6;

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
  if (value === "low" || value === "medium" || value === "high") {
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
 */
function hasDomainMismatch(
  senderDomain: string,
  bodyDomains: Set<string>,
): boolean {
  if (bodyDomains.size === 0) return false;

  const registeredDomain = (host: string) =>
    host.split(".").slice(REGISTERED_DOMAIN_PARTS).join(".");

  const senderRegistered = registeredDomain(senderDomain);
  for (const domain of bodyDomains) {
    if (registeredDomain(domain) === senderRegistered) {
      // At least one domain matches — not a mismatch
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
 * Main entry point: analyse an email and return a PhishingSignal if suspicious,
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
  if (confidence === "low" && reasons.length === 1 && suspicionScore <= 1) {
    return null;
  }

  return {
    confidence,
    reason: reasons.join("; "),
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
