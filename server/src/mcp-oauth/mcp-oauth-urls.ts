import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import { MCP_SERVER } from "../constants/mcp-server.constants";
import { ALL_PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { resolveBackendBaseUrl } from "../utils/backend-base-url.util";

/**
 * The authorization server's issuer: the API origin. The MCP server and its
 * authorization server share it, so one `/.well-known/` tree serves both.
 */
export function oauthIssuerUrl(): string {
  return resolveBackendBaseUrl();
}

/** Canonical URI of the MCP server (RFC 8707 resource, RFC 9728 `resource`). */
export function mcpResourceUrl(): string {
  return `${resolveBackendBaseUrl()}/${MCP_SERVER.ROUTE}`;
}

/**
 * Path-suffixed protected-resource metadata (RFC 9728 §3.1): what clients try
 * first for a resource with a path, and what the 401 challenge points at.
 */
export function protectedResourceMetadataUrl(): string {
  return `${resolveBackendBaseUrl()}${MCP_OAUTH.PATHS.PROTECTED_RESOURCE_METADATA}/${MCP_SERVER.ROUTE}`;
}

export function oauthEndpointUrl(
  path: (typeof MCP_OAUTH.PATHS)[keyof typeof MCP_OAUTH.PATHS],
): string {
  return `${resolveBackendBaseUrl()}${path}`;
}

/**
 * Normalises a resource indicator for comparison: lowercase scheme and host
 * (RFC 8707 says clients may vary their case) and no trailing slash.
 */
export function normaliseResourceUri(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hash) return null;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * `WWW-Authenticate` for an unauthenticated `/mcp` call (MCP spec / RFC 9728
 * §5.1). It must ride on a 401: Claude only starts sign-in from a 401.
 */
export function mcpBearerChallenge(hasPresentedToken: boolean): string {
  const parts = [
    ...(hasPresentedToken ? ['error="invalid_token"'] : []),
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    `scope="${ALL_PAT_SCOPES.join(" ")}"`,
  ];
  return `${MCP_OAUTH.TOKEN_TYPE_BEARER} ${parts.join(", ")}`;
}
