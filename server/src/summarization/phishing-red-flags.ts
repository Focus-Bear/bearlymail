/**
 * Deterministic phishing pre-checks.
 *
 * The LLM phishing check only sees what it is given, and a well-built
 * impersonation passes it: "SendGrid <noreply@unrelated-domain>" with valid
 * SPF/DKIM/DMARC for its own domain, links through SendGrid's real click
 * tracker, and a "sending is paused" threat. These checks catch the classic
 * patterns precisely enough to decide on their own when they combine; a lone
 * red flag is only a hint for the model (and stops Jev from clearing the email).
 */

import {
  IMPERSONATED_BRANDS,
  ImpersonatedBrand,
  LINK_REWRITE_DOMAINS,
  LINK_TEXT_TLDS,
  MULTI_PART_SUFFIX_LABELS,
  PHISHING_RED_FLAGS,
  PhishingRedFlag,
} from "../constants/phishing.constants";
import { PHISHING_CONFIDENCE } from "../constants/domain-types";
import {
  formatSenderAuthResults,
  hasSenderAuthFailure,
  SenderAuthResults,
} from "../utils/authentication-results.util";
import type { PhishingSignal } from "./phishing-detection.service";

export interface LinkTextMismatch {
  /** Domain the reader sees in the link text */
  shownDomain: string;
  /** Domain the link actually opens */
  linkedDomain: string;
}

export interface PhishingRedFlagInput {
  senderDomain: string | null;
  fromName?: string | null;
  subject?: string | null;
  body: string;
  htmlBody?: string | null;
  senderAuthResults?: SenderAuthResults | null;
}

export interface PhishingRedFlagAssessment {
  redFlags: PhishingRedFlag[];
  impersonatedBrand: string | null;
  linkTextMismatches: LinkTextMismatch[];
  accountThreats: string[];
  /** Set only when red flags combine into a verdict the LLM may not overrule */
  verdict: PhishingSignal | null;
}

/** Pressure to act before an account, service or sending is restored. */
const ACCOUNT_THREAT_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  {
    pattern:
      /\b(account|sending|service|access|mailbox|e-?mail)\b[^.!?\n]{0,40}\b(paused|suspended|locked|disabled|restricted|on hold|deactivated|blocked|frozen)\b/i,
    label: "account or sending paused/suspended",
  },
  {
    pattern:
      /\b(resume|restore|reactivate|unlock)\s+(your\s+)?(sending|service|access|account|mailbox)\b/i,
    label: "act to restore access",
  },
  {
    pattern:
      /\b(will not|won't|cannot|can't)\s+be\s+able\s+to\b[^.!?\n]{0,60}\buntil\b/i,
    label: "blocked until you act",
  },
  {
    pattern:
      /\bverify\s+(your\s+)?(consent|account|identity|password|payment|billing|details|information)\b/i,
    label: "verify account/consent/details",
  },
];

const ANCHOR_PATTERN =
  /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const TAG_PATTERN = /<[^>]*>/g;
const HTML_ENTITY_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&amp;/gi, "&"],
  [/&#46;|&period;/gi, "."],
];
const SHOWN_URL_PATTERN =
  /^(https?:\/\/)?(www\.)?((?:[a-z0-9-]+\.)+([a-z]{2,}))(?:[/:?#]\S*)?$/i;
const SHOWN_URL_GROUPS = { SCHEME: 1, WWW: 2, HOST: 3, TLD: 4 } as const;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
const MULTI_PART_SUFFIX_MIN_LABELS = 3;

/** "secure.paypal.com" → "paypal.com"; "mail.paypal.com.au" → "paypal.com.au". */
export function registeredDomainOf(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  const isMultiPartSuffix =
    labels.length >= MULTI_PART_SUFFIX_MIN_LABELS &&
    MULTI_PART_SUFFIX_LABELS.has(labels[labels.length - 2]);
  const keep = isMultiPartSuffix ? 3 : 2;
  return labels.slice(-keep).join(".");
}

function isWithinDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameAppearsIn(displayName: string, brandName: string): boolean {
  return new RegExp(`\\b${escapeRegExp(brandName)}\\b`, "i").test(displayName);
}

/**
 * The brand a sender's display name claims, when the sender's domain is not
 * one of that brand's — e.g. "SendGrid" from noreply@some-other-domain.
 */
export function detectImpersonatedBrand(
  fromName: string | null | undefined,
  senderDomain: string | null,
): ImpersonatedBrand | null {
  if (!fromName || !senderDomain) return null;
  const host = senderDomain.toLowerCase();
  const claimed = IMPERSONATED_BRANDS.find((brand) =>
    brand.names.some((name) => nameAppearsIn(fromName, name)),
  );
  if (!claimed) return null;
  const isBrandDomain = claimed.domains.some((domain) =>
    isWithinDomain(host, domain),
  );
  return isBrandDomain ? null : claimed;
}

function decodeAnchorText(rawText: string): string {
  const withoutTags = rawText.replace(TAG_PATTERN, " ");
  return HTML_ENTITY_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withoutTags,
  )
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameOf(href: string): string | null {
  try {
    const url = new URL(href.trim());
    return WEB_PROTOCOLS.has(url.protocol) ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The domain an anchor's visible text presents itself as, if it shows one. */
function shownDomainOf(text: string): string | null {
  const match = text.match(SHOWN_URL_PATTERN);
  if (!match) return null;
  const hasUrlPrefix = Boolean(
    match[SHOWN_URL_GROUPS.SCHEME] || match[SHOWN_URL_GROUPS.WWW],
  );
  const tld = match[SHOWN_URL_GROUPS.TLD].toLowerCase();
  if (!hasUrlPrefix && !LINK_TEXT_TLDS.has(tld)) return null;
  return match[SHOWN_URL_GROUPS.HOST].toLowerCase();
}

/**
 * Anchors whose visible text shows one domain but whose href opens another.
 * Links through ESP click trackers and mail-security proxies never show their
 * real destination, so those are skipped.
 */
export function findLinkTextMismatches(
  htmlBody: string | null | undefined,
): LinkTextMismatch[] {
  if (!htmlBody) return [];
  const mismatches = new Map<string, LinkTextMismatch>();
  for (const match of htmlBody.matchAll(ANCHOR_PATTERN)) {
    const linkedHost = hostnameOf(match[2]);
    const shownHost = shownDomainOf(decodeAnchorText(match[3]));
    if (!linkedHost || !shownHost) continue;
    const linkedDomain = registeredDomainOf(linkedHost);
    const shownDomain = registeredDomainOf(shownHost);
    if (linkedDomain === shownDomain) continue;
    if (LINK_REWRITE_DOMAINS.has(linkedDomain)) continue;
    mismatches.set(`${shownDomain}>${linkedDomain}`, {
      shownDomain,
      linkedDomain,
    });
  }
  return [...mismatches.values()];
}

/** Labels of the account-threat phrases found in the given text. */
export function findAccountThreats(text: string): string[] {
  return ACCOUNT_THREAT_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

function describeLinkMismatch(mismatch: LinkTextMismatch): string {
  return `a link shows ${mismatch.shownDomain} but opens ${mismatch.linkedDomain}`;
}

/** Plain-text summary of a link mismatch, as fed to the model. */
export function formatLinkTextMismatch(mismatch: LinkTextMismatch): string {
  return `text shows ${mismatch.shownDomain}, link opens ${mismatch.linkedDomain}`;
}

interface VerdictInput {
  senderDomain: string | null;
  brand: ImpersonatedBrand | null;
  linkTextMismatches: LinkTextMismatch[];
  accountThreats: string[];
  senderAuthResults: SenderAuthResults | null | undefined;
}

function collectEvidence(input: VerdictInput): string[] {
  const evidence: string[] = [];
  if (input.brand) {
    evidence.push(
      `The sender name claims to be ${input.brand.brand} but the email comes from ${input.senderDomain}, which is not a ${input.brand.brand} domain`,
    );
  }
  if (hasSenderAuthFailure(input.senderAuthResults)) {
    evidence.push(
      `it failed sender authentication (${formatSenderAuthResults(input.senderAuthResults)})`,
    );
  }
  input.linkTextMismatches.forEach((mismatch) =>
    evidence.push(describeLinkMismatch(mismatch)),
  );
  if (input.accountThreats.length > 0) {
    evidence.push("it pressures you to act to restore your account");
  }
  return evidence;
}

/**
 * The decision rule. Each combination below is rare in legitimate mail:
 * - brand impersonation plus any other red flag or an account threat → high
 * - a disguised link plus an account threat → high
 * - failed sender authentication plus an account threat → medium
 */
function decideVerdict(input: VerdictInput): PhishingSignal | null {
  const hasThreat = input.accountThreats.length > 0;
  const hasLinkMismatch = input.linkTextMismatches.length > 0;
  const hasAuthFailure = hasSenderAuthFailure(input.senderAuthResults);
  const reason = () => `${collectEvidence(input).join("; ")}.`;

  if (input.brand && (hasThreat || hasLinkMismatch || hasAuthFailure)) {
    return { confidence: PHISHING_CONFIDENCE.HIGH, reason: reason() };
  }
  if (hasLinkMismatch && hasThreat) {
    return { confidence: PHISHING_CONFIDENCE.HIGH, reason: reason() };
  }
  if (hasAuthFailure && hasThreat) {
    return { confidence: PHISHING_CONFIDENCE.MEDIUM, reason: reason() };
  }
  return null;
}

/** Run every deterministic pre-check on one email. */
export function assessPhishingRedFlags(
  input: PhishingRedFlagInput,
): PhishingRedFlagAssessment {
  const brand = detectImpersonatedBrand(input.fromName, input.senderDomain);
  const linkTextMismatches = findLinkTextMismatches(input.htmlBody);
  const accountThreats = findAccountThreats(
    [input.subject ?? "", input.body].join("\n"),
  );

  const redFlags: PhishingRedFlag[] = [];
  if (brand) redFlags.push(PHISHING_RED_FLAGS.BRAND_IMPERSONATION);
  if (hasSenderAuthFailure(input.senderAuthResults)) {
    redFlags.push(PHISHING_RED_FLAGS.AUTH_FAILURE);
  }
  if (linkTextMismatches.length > 0) {
    redFlags.push(PHISHING_RED_FLAGS.LINK_TEXT_MISMATCH);
  }

  return {
    redFlags,
    impersonatedBrand: brand?.brand ?? null,
    linkTextMismatches,
    accountThreats,
    verdict: decideVerdict({
      senderDomain: input.senderDomain,
      brand,
      linkTextMismatches,
      accountThreats,
      senderAuthResults: input.senderAuthResults,
    }),
  };
}
