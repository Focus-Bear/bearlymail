import {
  CSP_DISPOSITIONS,
  CSP_REPORT_MAX_ENTRIES,
  CSP_UNKNOWN_VALUE,
  CSP_VIOLATION_REPORT_TYPE,
  LEGACY_CSP_REPORT_KEY,
} from "../constants/csp-report.constants";

/** A violation reduced to non-identifying fields that are safe to log. */
export interface CspViolationSummary {
  directive: string;
  blocked: string;
  documentOrigin: string;
  sourceOrigin: string;
  disposition: string;
}

type UnknownRecord = Record<string, unknown>;

const DIRECTIVE_PATTERN = /^[a-z-]{1,40}$/;
/** CSP keywords browsers report instead of a URL (`inline`, `eval`, `wasm-eval`, ...). */
const KEYWORD_PATTERN = /^[a-z-]{1,32}$/;
const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]{0,20}):/i;
const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reduces a reported URL to its origin (network URLs), its scheme (`data:`,
 * `blob:`, ...) or a CSP keyword, so paths and query strings — which can carry
 * ids or tokens — never reach the logs.
 */
export function toSafeLocation(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return CSP_UNKNOWN_VALUE;
  try {
    const url = new URL(value);
    if (NETWORK_PROTOCOLS.has(url.protocol)) return url.origin;
    return url.protocol;
  } catch {
    if (KEYWORD_PATTERN.test(value)) return value;
    const scheme = URL_SCHEME_PATTERN.exec(value);
    return scheme ? `${scheme[1].toLowerCase()}:` : CSP_UNKNOWN_VALUE;
  }
}

function toDirective(value: unknown): string {
  if (typeof value !== "string") return CSP_UNKNOWN_VALUE;
  // Older browsers report the whole violated directive ("img-src 'self' https:").
  const name = value.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return DIRECTIVE_PATTERN.test(name) ? name : CSP_UNKNOWN_VALUE;
}

function toDisposition(value: unknown): string {
  return (
    CSP_DISPOSITIONS.find((disposition) => disposition === value) ??
    CSP_UNKNOWN_VALUE
  );
}

function fromLegacyReport(report: UnknownRecord): CspViolationSummary {
  return {
    directive: toDirective(
      report["effective-directive"] ?? report["violated-directive"],
    ),
    blocked: toSafeLocation(report["blocked-uri"]),
    documentOrigin: toSafeLocation(report["document-uri"]),
    sourceOrigin: toSafeLocation(report["source-file"]),
    disposition: toDisposition(report.disposition),
  };
}

function fromReportingApiBody(body: UnknownRecord): CspViolationSummary {
  return {
    directive: toDirective(body.effectiveDirective),
    blocked: toSafeLocation(body.blockedURL),
    documentOrigin: toSafeLocation(body.documentURL),
    sourceOrigin: toSafeLocation(body.sourceFile),
    disposition: toDisposition(body.disposition),
  };
}

/**
 * Parses a CSP report body in either format — a legacy `{ "csp-report": {...} }`
 * object (`report-uri`) or a Reporting API array of `{ type, body }` entries
 * (`report-to`) — into at most `CSP_REPORT_MAX_ENTRIES` loggable summaries.
 * Anything unrecognised yields an empty list.
 */
export function summarizeCspReportBody(body: unknown): CspViolationSummary[] {
  if (Array.isArray(body)) {
    return body
      .filter(
        (entry): entry is UnknownRecord =>
          isRecord(entry) &&
          entry.type === CSP_VIOLATION_REPORT_TYPE &&
          isRecord(entry.body),
      )
      .slice(0, CSP_REPORT_MAX_ENTRIES)
      .map((entry) => fromReportingApiBody(entry.body as UnknownRecord));
  }
  if (isRecord(body) && isRecord(body[LEGACY_CSP_REPORT_KEY])) {
    return [fromLegacyReport(body[LEGACY_CSP_REPORT_KEY] as UnknownRecord)];
  }
  return [];
}

/** One-line log message for a violation summary. */
export function formatCspViolation(summary: CspViolationSummary): string {
  return (
    `CSP violation (${summary.disposition}): ${summary.directive} blocked ${summary.blocked}` +
    ` on ${summary.documentOrigin} (source ${summary.sourceOrigin})`
  );
}
