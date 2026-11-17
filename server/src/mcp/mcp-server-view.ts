import {
  MCP_AUTH_TYPES,
  MCPAuthType,
  MCPServerConfig,
  MCPServerPurpose,
  MCPToolDefinition,
} from "../database/entities/mcp-server-config.entity";

/** Shown in place of the URL path, which often embeds an access key (Zoho MCP). */
export const REDACTED_URL_PATH = "/…";
const UNPARSEABLE_URL_PLACEHOLDER = "…";

/**
 * What the API returns for a connection. Deliberately omits every credential
 * (API key, OAuth tokens, client secret, PKCE verifier, auth state) and the
 * full server URL: several providers put the access key in the URL itself, so
 * the URL is a secret too.
 */
export interface MCPServerView {
  id: string;
  name: string;
  /** Scheme + host only, e.g. `https://example.zohomcp.com/…`. */
  serverUrlRedacted: string;
  authType: MCPAuthType;
  purpose: MCPServerPurpose;
  enabled: boolean;
  hasApiKey: boolean;
  /** True for an OAuth connection the user hasn't (successfully) signed in to. */
  needsAuthorization: boolean;
  cachedTools: MCPToolDefinition[] | null;
  toolsCachedAt: Date | null;
  createdAt: Date;
}

/** Reduce a server URL to its origin so the path/query (and any key in them) never leaves the server. */
export function redactServerUrl(serverUrl: string): string {
  try {
    return `${new URL(serverUrl).origin}${REDACTED_URL_PATH}`;
  } catch {
    return UNPARSEABLE_URL_PLACEHOLDER;
  }
}

/** An OAuth connection with no usable token yet — the user must sign in. */
export function isAwaitingOAuthAuthorization(config: MCPServerConfig): boolean {
  return (
    config.authType === MCP_AUTH_TYPES.OAUTH &&
    !config.accessToken &&
    !config.refreshToken
  );
}

export function toMCPServerView(config: MCPServerConfig): MCPServerView {
  return {
    id: config.id,
    name: config.name,
    serverUrlRedacted: redactServerUrl(config.serverUrl),
    authType: config.authType,
    purpose: config.purpose,
    enabled: config.enabled,
    hasApiKey: Boolean(config.apiKey),
    needsAuthorization: isAwaitingOAuthAuthorization(config),
    cachedTools: config.cachedTools,
    toolsCachedAt: config.toolsCachedAt,
    createdAt: config.createdAt,
  };
}
