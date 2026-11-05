import { DAYS_PER_WEEK, DAYS_PER_YEAR } from './numbers';

const DAYS_PER_MONTH = 30;
const DAYS_PER_QUARTER = 90;

/** Must match the server's PAT_SCOPES (server/src/constants/personal-access-tokens.constants.ts). */
export const PAT_SCOPES = {
  MAIL_READ: 'mail:read',
  MAIL_SEND: 'mail:send',
} as const;

export type PatScope = (typeof PAT_SCOPES)[keyof typeof PAT_SCOPES];

/** Must match the server's ACCESS_TOKEN_KINDS: a hand-made token or an OAuth connection (claude.ai). */
export const ACCESS_TOKEN_KINDS = {
  PERSONAL: 'personal',
  OAUTH: 'oauth',
} as const;

export type AccessTokenKind = (typeof ACCESS_TOKEN_KINDS)[keyof typeof ACCESS_TOKEN_KINDS];

/** Where claude.ai users add a custom connector. */
export const CLAUDE_CONNECTORS_URL = 'https://claude.ai/customize/connectors';

/** Web-app route the server's /oauth/authorize sends the browser to; must match MCP_OAUTH.CONSENT_PAGE_PATH. */
export const OAUTH_CONSENT_PATH = '/oauth/consent';
export const OAUTH_CONSENT_REQUEST_PARAM = 'request';
export const OAUTH_CONSENT_REQUESTS_ENDPOINT = '/oauth/consent-requests';

export const PERSONAL_ACCESS_TOKENS_ENDPOINT = '/personal-access-tokens';

/** BearlyMail's MCP endpoint path on the API origin. */
export const MCP_ENDPOINT_PATH = '/mcp';

/** Name the setup snippets register the server under in Claude. */
export const MCP_CLIENT_SERVER_NAME = 'bearlymail';

export const DEFAULT_TOKEN_NAME = 'AI app';

/** Expiry choices; must be a subset of the server's ALLOWED_EXPIRY_DAYS. `null` = never expires. */
export const TOKEN_EXPIRY_OPTIONS: readonly (number | null)[] = [
  DAYS_PER_WEEK,
  DAYS_PER_MONTH,
  DAYS_PER_QUARTER,
  DAYS_PER_YEAR,
  null,
];

export const DEFAULT_TOKEN_EXPIRY_DAYS = DAYS_PER_QUARTER;

/** Mirrors the server's MAX_NAME_LENGTH. */
export const MAX_TOKEN_NAME_LENGTH = 100;
