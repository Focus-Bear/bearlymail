import { MCP_OAUTH } from "../constants/mcp-oauth.constants";

const HTTPS_PROTOCOL = "https:";
const HTTP_PROTOCOL = "http:";
const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

function parse(uri: string): URL | null {
  if (uri.length > MCP_OAUTH.MAX_REDIRECT_URI_LENGTH) return null;
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopbackUrl(url: URL): boolean {
  return (
    url.protocol === HTTP_PROTOCOL &&
    LOOPBACK_HOSTS.includes(url.hostname.toLowerCase())
  );
}

/** True for a native app's `http://localhost:<port>/…` style redirect. */
export function isLoopbackRedirectUri(uri: string): boolean {
  const url = parse(uri);
  return !!url && isLoopbackUrl(url);
}

/**
 * Whether a client may register (or list in its metadata document) this
 * redirect URI. MCP spec: HTTPS, or HTTP to a loopback host; never a fragment
 * or userinfo.
 */
export function isRegistrableRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.hash || url.username || url.password) return false;
  return url.protocol === HTTPS_PROTOCOL || isLoopbackUrl(url);
}

/**
 * Exact-match a requested redirect URI against the registered ones, except
 * that a loopback URI matches on any port (RFC 8252 §7.3). Claude Code
 * registers `http://localhost/callback` and redirects to an ephemeral port.
 */
export function matchesRegisteredRedirectUri(
  requested: string,
  registered: readonly string[],
): boolean {
  if (!isRegistrableRedirectUri(requested)) return false;
  if (registered.includes(requested)) return true;
  const requestedUrl = parse(requested);
  if (!requestedUrl || !isLoopbackUrl(requestedUrl)) return false;
  return registered.some((candidate) => {
    const candidateUrl = parse(candidate);
    return (
      !!candidateUrl &&
      isLoopbackUrl(candidateUrl) &&
      candidateUrl.hostname.toLowerCase() ===
        requestedUrl.hostname.toLowerCase() &&
      candidateUrl.pathname === requestedUrl.pathname &&
      candidateUrl.search === requestedUrl.search
    );
  });
}

/** Hostname shown on the consent screen, so the user sees where the code goes. */
export function redirectUriHost(uri: string): string {
  return parse(uri)?.hostname ?? uri;
}
