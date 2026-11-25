/**
 * Deterministic phishing pre-checks.
 *
 * The LLM phishing check only sees what it is given, and a well-built
 * impersonation passes it: "SendGrid <noreply@unrelated-domain>" with valid
 * SPF/DKIM/DMARC for its own domain, links through SendGrid's real click
 * tracker, and a "sending is paused" threat. These checks catch the classic
 * patterns precisely enough to decide on their own when they combine; a lone
 * red flag is only a hint for the model (and stops Jev from clearing the email).
 *
 * Not every lure threatens a suspension: "SendGrid <noreply@unrelated-domain>"
 * following up on a "support chat" that asked to change two-factor settings,
 * "in case it was not you", carries no threat at all, and the model cleared it
 * as a routine security notice. Those account-security pretexts are matched
 * separately and only decide anything alongside a brand impersonation.
 */

import { PHISHING_CONFIDENCE } from "../constants/domain-types";
import {
  IMPERSONATED_BRANDS,
  ImpersonatedBrand,
  LINK_REWRITE_DOMAINS,
  LINK_TEXT_TLDS,
  MULTI_PART_SUFFIX_LABELS,
  PHISHING_RED_FLAGS,
  PhishingRedFlag,
} from "../constants/phishing.constants";
import {
  formatSenderAuthResults,
  hasSenderAuthFailure,
  SenderAuthResults,
} from "../utils/authentication-results.util";
import { stripTags } from "../utils/html-strip.util";
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
  securityLures: string[];
  /** Link domains that are neither the claimed brand's nor the sender's */
  offBrandLinkDomains: string[];
  /** Set only when red flags combine into a verdict the LLM may not overrule */
  verdict: PhishingSignal | null;
}

/**
 * Pressure to act before an account, service or sending is restored.
 *
 * Sending platforms (SendGrid, Mailchimp, Mailgun, Postmark, Brevo, SES…) are
 * impersonated with administrative pretexts rather than security ones: a
 * compliance or consent "error", or business details ("confirm your
 * industry") that must be given before sending resumes. Those are matched as
 * the hold itself, not by any one lure's wording.
 */
const ACCOUNT_THREAT_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  {
    pattern:
      /\b(account|sending|service|access|mailbox|e-?mail|campaigns?|deliver(y|ies))\b[^.!?\n]{0,40}\b(paused|suspended|locked|disabled|restricted|on hold|deactivated|blocked|frozen|halted)\b/i,
    label: "account or sending paused/suspended",
  },
  {
    pattern:
      /\b(resume|restore|reactivate|unlock|re-?enable)\s+(your\s+)?(sending|service|access|account|mailbox|campaigns?|deliver(y|ies))\b|\b(continue|keep)\s+sending\b/i,
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
  {
    pattern:
      /\b(compliance|consent|policy|verification)\s+(error|failure|violation|hold)\b|\baccount\s+(is\s+)?(under|pending)\s+review\b/i,
    label: "a compliance or verification hold",
  },
  {
    pattern:
      /\b(confirm|verify|update|complete|select|provide)\s+(your\s+)?(account['’]?s?\s+)?(industry|use[- ]case|business\s+(type|category|details|information)|sender\s+(identity|details|information)|company\s+(details|information))\b/i,
    label: "business details required to keep sending",
  },
  {
    pattern:
      /\b(sending|send|email)\s+(limits?|quota|privileges?|reputation)\b[^.!?\n]{0,40}\b(reduced|exceeded|reached|revoked|lowered|restricted|suspended)\b/i,
    label: "sending limits reduced or revoked",
  },
];

/**
 * Account-security pretexts: a supposed support conversation about your
 * account, a sign-in setting someone tried to change, and "if this wasn't you".
 * Real security notices use them too, so they only count from a sender whose
 * display name impersonates a brand.
 */
const SECURITY_LURE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  {
    pattern:
      /\b(two[- ]factor|2fa|multi[- ]factor|mfa|two[- ]step)\b|\bsecurity\s+settings\b/i,
    label: "two-factor or security settings",
  },
  {
    pattern:
      /\b(if|in case)\s+(this|it|that|the\s+\w+)\s+(was\s+not|wasn['’]?t)\s+(you|yours)\b/i,
    label: "if this was not you",
  },
  {
    pattern:
      /\b(account\s+number|billing\s+(zip|post\s?code|address)|plan\s+details|security\s+questions?)\b/i,
    label: "quotes your account details",
  },
  {
    pattern:
      /\bsupport\s+(chat|call|ticket|session)\b|\b(chat|call)\s+(session\s+)?with\s+[\w ]{0,30}\bsupport\b/i,
    label: "a support conversation about your account",
  },
];

/**
 * Two distinct pretexts are needed: one alone ("multi-factor authentication"
 * in a partner's webinar invite) is ordinary mail.
 */
const MIN_SECURITY_LURES_FOR_VERDICT = 2;

/**
 * "GitHub via Engineering <engineering@acme.com>": a mailing list (e.g. a
 * Google Group) relaying a real brand's email keeps the brand's name but sends
 * from the list's own domain, so it looks like brand impersonation. Real
 * security notices relayed that way carry the same pretexts ("two-factor",
 * "if this was not you"), so the pretext rule doesn't decide for these; the
 * brand flag still reaches the model, and the other rules still apply.
 */
const RELAYED_SENDER_PATTERN = /\S\s+via\s+\S/i;

function isRelayedSender(fromName: string | null | undefined): boolean {
  return Boolean(fromName && RELAYED_SENDER_PATTERN.test(fromName));
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/gi;
const HREF_PATTERN = /\bhref\s*=\s*(["'])([^"'<>]{1,2000})\1/gi;

// Bounded spans keep matching linear: an anchor's attributes and its text are
// each capped, so mail made of thousands of unclosed `<a href>` tags cannot
// make every one of them scan to the end of the body.
const ANCHOR_PATTERN =
  /<a\b[^<>]{0,2000}?\bhref\s*=\s*(["'])([^<>]{0,2000}?)\1[^<>]{0,2000}>([\s\S]{0,2000}?)<\/a>/gi;
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

/** Every href in the HTML; its other URLs (DOCTYPE, xmlns, images) are not links. */
function hrefsOf(htmlBody: string | null | undefined): string[] {
  if (!htmlBody) return [];
  return [...htmlBody.matchAll(HREF_PATTERN)].map((match) => match[2]);
}

/** Hostnames of every http(s) link in the text and HTML bodies. */
function linkHostsOf(
  body: string,
  htmlBody: string | null | undefined,
): string[] {
  const urls = [...(body.match(URL_PATTERN) ?? []), ...hrefsOf(htmlBody)];
  const hosts = urls
    .map(hostnameOf)
    .filter((host): host is string => Boolean(host));
  return [...new Set(hosts)];
}

/**
 * Registered domains the email links to that belong neither to the brand its
 * display name claims nor to the sender itself (click trackers excluded).
 */
export function findOffBrandLinkDomains(
  brand: ImpersonatedBrand | null,
  senderDomain: string | null,
  linkHosts: readonly string[],
): string[] {
  if (!brand) return [];
  const senderRegistered = senderDomain
    ? registeredDomainOf(senderDomain)
    : null;
  const offBrand = linkHosts
    .filter(
      (host) => !brand.domains.some((domain) => isWithinDomain(host, domain)),
    )
    .map(registeredDomainOf)
    .filter(
      (domain) =>
        domain !== senderRegistered && !LINK_REWRITE_DOMAINS.has(domain),
    );
  return [...new Set(offBrand)];
}

/** Labels of the account-security pretexts found in the given text. */
export function findSecurityLures(text: string): string[] {
  return SECURITY_LURE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

function decodeAnchorText(rawText: string): string {
  const withoutTags = stripTags(rawText, " ");
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
  return ACCOUNT_THREAT_PATTERNS.filter(({ pattern }) =>
    pattern.test(text),
  ).map(({ label }) => label);
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
  securityLures: string[];
  offBrandLinkDomains: string[];
  senderAuthResults: SenderAuthResults | null | undefined;
  isRelayedSender: boolean;
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
  if (input.brand && input.securityLures.length > 0) {
    evidence.push(
      `it uses an account-security pretext (${input.securityLures.join(", ")})`,
    );
  }
  if (input.brand && input.offBrandLinkDomains.length > 0) {
    evidence.push(
      `its links go to ${input.offBrandLinkDomains.join(", ")}, not ${input.brand.brand}`,
    );
  }
  return evidence;
}

/**
 * The decision rule. Each combination below is rare in legitimate mail:
 * - brand impersonation plus an auth failure, a disguised link, an account
 *   threat or two account-security pretexts → high (an off-brand link alone is
 *   not enough: a partner's webinar legitimately links to a third-party host).
 *   The pretext rule is skipped for mailing-list senders ("X via Group").
 * - a disguised link plus an account threat → high
 * - failed sender authentication plus an account threat → medium
 */
function decideVerdict(input: VerdictInput): PhishingSignal | null {
  const hasThreat = input.accountThreats.length > 0;
  const hasLinkMismatch = input.linkTextMismatches.length > 0;
  const hasAuthFailure = hasSenderAuthFailure(input.senderAuthResults);
  const hasSecurityPretext =
    !input.isRelayedSender &&
    input.securityLures.length >= MIN_SECURITY_LURES_FOR_VERDICT;
  const reason = () => `${collectEvidence(input).join("; ")}.`;

  if (
    input.brand &&
    (hasThreat || hasLinkMismatch || hasAuthFailure || hasSecurityPretext)
  ) {
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
  const fullText = [input.subject ?? "", input.body].join("\n");
  const accountThreats = findAccountThreats(fullText);
  const securityLures = findSecurityLures(fullText);
  const offBrandLinkDomains = findOffBrandLinkDomains(
    brand,
    input.senderDomain,
    linkHostsOf(input.body, input.htmlBody),
  );

  const redFlags: PhishingRedFlag[] = [];
  if (brand) redFlags.push(PHISHING_RED_FLAGS.BRAND_IMPERSONATION);
  if (hasSenderAuthFailure(input.senderAuthResults)) {
    redFlags.push(PHISHING_RED_FLAGS.AUTH_FAILURE);
  }
  if (linkTextMismatches.length > 0) {
    redFlags.push(PHISHING_RED_FLAGS.LINK_TEXT_MISMATCH);
  }
  if (offBrandLinkDomains.length > 0) {
    redFlags.push(PHISHING_RED_FLAGS.OFF_BRAND_LINK);
  }

  return {
    redFlags,
    impersonatedBrand: brand?.brand ?? null,
    linkTextMismatches,
    accountThreats,
    securityLures,
    offBrandLinkDomains,
    verdict: decideVerdict({
      senderDomain: input.senderDomain,
      brand,
      linkTextMismatches,
      accountThreats,
      securityLures,
      offBrandLinkDomains,
      senderAuthResults: input.senderAuthResults,
      isRelayedSender: isRelayedSender(input.fromName),
    }),
  };
}
