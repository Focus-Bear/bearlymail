import { DAYS_PER_WEEK, DAYS_PER_YEAR } from './numbers';

const DAYS_PER_MONTH = 30;
const DAYS_PER_QUARTER = 90;

/** Must match the server's PAT_SCOPES (server/src/constants/personal-access-tokens.constants.ts). */
export const PAT_SCOPES = {
  MAIL_READ: 'mail:read',
  MAIL_SEND: 'mail:send',
} as const;

export type PatScope = (typeof PAT_SCOPES)[keyof typeof PAT_SCOPES];

export const PERSONAL_ACCESS_TOKENS_ENDPOINT = '/personal-access-tokens';

/** BearlyMail's MCP endpoint path on the API origin. */
export const MCP_ENDPOINT_PATH = '/mcp';

/** Name the setup snippets register the server under in Claude. */
export const MCP_CLIENT_SERVER_NAME = 'bearlymail';

export const DEFAULT_TOKEN_NAME = 'Claude';

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
