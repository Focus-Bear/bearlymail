/**
 * URL validation utilities for outbound HTTP requests.
 *
 * Guards against Server-Side Request Forgery (SSRF) by rejecting URLs that
 * target private/loopback addresses or use non-HTTPS schemes.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */

/**
 * RFC-1918 / loopback / link-local ranges that must never be targeted by
 * outbound requests originating from user-supplied URLs.
 *
 * Matches:
 *   - localhost
 *   - 127.0.0.0/8  (loopback)
 *   - 10.0.0.0/8   (private)
 *   - 172.16.0.0/12 (private)
 *   - 192.168.0.0/16 (private)
 *   - 169.254.0.0/16 (link-local / AWS metadata)
 *   - ::1            (IPv6 loopback)
 *   - [::1]          (IPv6 loopback bracketed)
 */
const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|\[::1\]$)/i;

/**
 * Validate a URL before making an outbound HTTP request.
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
    throw new Error(`${label}: invalid URL "${raw}"`);
  }

  if (parsed.protocol !== "https:") {
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
  if (PRIVATE_HOST_RE.test(host)) {
    throw new Error(
      `${label}: requests to private/internal hosts are not allowed ("${host}")`,
    );
  }
}
