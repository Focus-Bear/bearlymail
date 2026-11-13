import { MILLISECONDS } from "../../constants/time-constants";

/**
 * Fixed Zoho Bigin lookups behind the sender-context card. Tool names are the
 * ones Zoho's MCP server exposes; argument and field names are Bigin REST v2
 * API names, which the MCP tools pass through unchanged.
 */
export const BIGIN_TOOLS = {
  SEARCH_RECORDS: "Bigin_searchRecords",
  GET_RELATED_LIST_RECORDS: "Bigin_getRelatedListRecords",
  GET_NOTES_FROM_RECORD: "Bigin_getNotesFromSpecificRecord",
  GET_SPECIFIC_RECORD: "Bigin_getSpecificRecord",
} as const;

/**
 * Key of the record array in Bigin's list envelope (`{ data: [...], info }`).
 * A search with no hits returns no body at all.
 */
export const BIGIN_RESPONSE_RECORDS_KEY = "data";

export const BIGIN_MODULES = {
  CONTACTS: "Contacts",
  ACCOUNTS: "Accounts",
} as const;

export type BiginParentModule =
  (typeof BIGIN_MODULES)[keyof typeof BIGIN_MODULES];

/** Bigin calls its deals module "Pipelines"; the related list is still "Deals". */
export const BIGIN_RELATED_LISTS = {
  DEALS: "Deals",
} as const;

/** Wrapper objects Zoho's MCP tools use for REST path / query parameters. */
export const BIGIN_ARG_GROUPS = {
  PATH: "path_variables",
  QUERY: "query_params",
} as const;

export const BIGIN_ARGS = {
  MODULE: "module_api_name",
  RELATED_LIST: "related_list_api_name",
  RECORD_ID: "id",
  EMAIL: "email",
  WORD: "word",
  FIELDS: "fields",
  PER_PAGE: "per_page",
} as const;

export const BIGIN_FIELDS = {
  DEALS: [
    "Deal_Name",
    "Stage",
    "Amount",
    "Closing_Date",
    "Pipeline",
    "Sub_Pipeline",
    "Modified_Time",
  ],
  NOTES: ["Note_Title", "Note_Content", "Created_Time"],
} as const;

/**
 * Markers in a failed get-by-ID result meaning the record no longer exists
 * (deleted or merged away), as opposed to a transient failure such as a rate
 * limit. Bigin reports an unknown record ID as INVALID_DATA.
 */
export const BIGIN_RECORD_GONE_MARKERS: readonly string[] = [
  "INVALID_DATA",
  "RECORD_NOT_FOUND",
  "NOT_FOUND",
  "404",
];

export const BIGIN_LIMITS = {
  /** Deals fetched per lookup, before open/recency sorting. */
  DEALS_FETCHED: 20,
  /** Deals kept in the compact context. */
  DEALS_KEPT: 5,
  /** Notes fetched per lookup; the tool has no sort argument, so we sort locally. */
  NOTES_FETCHED: 20,
  /** Most-recent notes kept in the compact context. */
  NOTES_KEPT: 3,
  /** Note bodies are trimmed so a pasted email thread can't bloat the card. */
  NOTE_MAX_CHARS: 280,
} as const;

/**
 * Stages Bigin ships as closed in its default pipelines. Custom pipelines can
 * rename them, so anything else counts as open — the cost is only ordering.
 */
export const BIGIN_CLOSED_STAGE_PREFIX = "closed";

/**
 * How long a "sender not in Bigin" result is trusted before searching again.
 * A found match has no TTL: it is re-validated on every fetch by ID instead.
 */
export const BIGIN_MISS_TTL_MS = MILLISECONDS.DAY;

/**
 * Zoho data centres by top-level domain. A connection's region is read from
 * its OAuth issuer (accounts.zoho.<tld>) or MCP URL (mcp.zoho.<tld> /
 * <name>.zohomcp.<tld>); the Bigin web app lives at bigin.zoho.<tld>.
 * Longest first, so "com.au" wins over "com".
 */
export const ZOHO_REGION_TLDS: readonly string[] = [
  "com.au",
  "com",
  "eu",
  "in",
  "jp",
];

/** Second-level domains a Zoho connection host can sit under. */
export const ZOHO_BASE_DOMAINS: readonly string[] = ["zoho", "zohomcp"];

export const BIGIN_WEB = {
  HOST_PREFIX: "bigin.zoho.",
  /** Web-app record route; Bigin's SPA routes use the lowercased module name. */
  RECORD_PATH: "/bigin/Home#/",
  SCHEME: "https://",
} as const;

export const CRM_PROVIDERS = {
  ZOHO_BIGIN: "zoho_bigin",
} as const;

export type CrmProvider = (typeof CRM_PROVIDERS)[keyof typeof CRM_PROVIDERS];

/**
 * Mailbox providers whose domain says nothing about the sender's company, so
 * a company-by-domain lookup would match unrelated accounts.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "zohomail.com",
  "gmx.com",
  "fastmail.com",
  "bigpond.com",
  "optusnet.com.au",
]);
