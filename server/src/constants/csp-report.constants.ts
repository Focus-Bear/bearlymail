/** Route (no global prefix) that browsers POST Content-Security-Policy violation reports to. */
export const CSP_REPORT_ROUTE = "csp-report";

/**
 * Report body media types: `application/csp-report` (legacy `report-uri`) and
 * `application/reports+json` (Reporting API `report-to`). Only these are parsed
 * on the report route; the global JSON parser ignores both.
 */
export const CSP_REPORT_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
];

/** Reports are tiny; anything bigger is rejected before parsing. */
export const CSP_REPORT_MAX_BODY_SIZE = "8kb";

/** Per-client report budget (reports are best effort, so dropping extras is fine). */
export const CSP_REPORT_RATE_LIMIT = 60;
export const CSP_REPORT_RATE_WINDOW_MS = 60_000;

/** Upper bound on violations logged from a single (batched) report body. */
export const CSP_REPORT_MAX_ENTRIES = 10;

/** Reporting API `type` of a CSP violation report. */
export const CSP_VIOLATION_REPORT_TYPE = "csp-violation";

/** Legacy `report-uri` bodies wrap the violation in this key. */
export const LEGACY_CSP_REPORT_KEY = "csp-report";

export const CSP_DISPOSITIONS = ["enforce", "report"] as const;

export const CSP_UNKNOWN_VALUE = "unknown";
