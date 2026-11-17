/**
 * URL validation for outbound HTTP requests to user-supplied URLs.
 *
 * This is the static half of the Server-Side Request Forgery (SSRF) guard:
 * scheme, userinfo and IP-literal / localhost hosts. Names that resolve to
 * internal addresses, and redirects, are refused at connect time by the
 * agents in `safe-http/safe-http.ts` (`safeAxiosConfig`), so always send the
 * request with that config too.
 */
import { isIP } from "net";

import { isBlockedAddress } from "./safe-http/blocked-address";
import { isPrivateOutboundAllowed } from "./safe-http/safe-http";

const HTTPS_PROTOCOL = "https:";
const HTTP_PROTOCOL = "http:";
const LOCALHOST = "localhost";
const LOCALHOST_SUFFIX = ".localhost";
const IPV6_BRACKETS_PATTERN = /^\[|\]$/g;

/**
 * Hosts that are internal without a DNS lookup: localhost names and IP
 * literals in blocked ranges (Node skips the socket `lookup` for literals).
 */
function isInternalLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(IPV6_BRACKETS_PATTERN, "");
  if (host === LOCALHOST || host.endsWith(LOCALHOST_SUFFIX)) return true;
  return isIP(host) !== 0 && isBlockedAddress(host);
}

/**
 * Validate a URL before making an outbound HTTP request.
 *
 * When private targets are allowed for local development
 * (`ALLOW_PRIVATE_OUTBOUND_URLS`, development/test only), http:// and
 * internal hosts are accepted too.
 *
 * @param raw   - The raw URL string to validate.
 * @param label - A short description used in error messages (e.g. "webhook URL").
 * @throws {Error} if the URL is malformed, uses a non-HTTPS scheme, contains
 *                 userinfo (`user:pass@host`), or targets a private/loopback host.
 */
export function assertSafeOutboundUrl(raw: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Never echo the raw value: some URLs (e.g. Zoho MCP) embed an access key.
    throw new Error(`${label}: invalid URL`);
  }

  const allowPrivate = isPrivateOutboundAllowed();
  const schemeAllowed =
    parsed.protocol === HTTPS_PROTOCOL ||
    (allowPrivate && parsed.protocol === HTTP_PROTOCOL);
  if (!schemeAllowed) {
    throw new Error(
      `${label}: only https:// URLs are allowed (got "${parsed.protocol}")`,
    );
  }

  // Reject userinfo (e.g. `https://accounts.google.com@evil.com/`). The actual
  // host is `evil.com`, but the leading segment can be used to phish users who
  // glance at the URL bar before redirect resolves.
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(
      `${label}: URLs with userinfo (user:pass@host) are not allowed`,
    );
  }

  const host = parsed.hostname;
  if (!allowPrivate && isInternalLiteralHost(host)) {
    throw new Error(
      `${label}: requests to private/internal hosts are not allowed ("${host}")`,
    );
  }
}
