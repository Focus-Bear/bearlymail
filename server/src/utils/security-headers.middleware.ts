import { NextFunction, Request, Response } from "express";

/**
 * The API only serves JSON, files and redirects — never an HTML page that loads
 * subresources — so its responses get a deny-everything policy. The web app's
 * own policy is set by the CDN that serves the frontend, not here.
 */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Applies HTTP security headers required for CASA Tier 2/3 compliance.
 *
 * Addresses:
 * - Missing Anti-clickjacking Header (X-Frame-Options + CSP frame-ancestors)
 * - X-Content-Type-Options Header Missing
 * - Strict-Transport-Security (HSTS) Not Set
 * - X-Powered-By information disclosure
 * - XSS Protection header missing
 * - Referrer-Policy missing
 * - Cache-Control: prevent sensitive API responses from being cached in proxies/CDNs
 *   (OWASP ASVS req 8.3.4)
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  res.setHeader("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
  // Prevent sensitive API responses from being cached by proxies, CDNs, or load balancers.
  res.setHeader("Cache-Control", "no-store");
  res.removeHeader("X-Powered-By");
  next();
}
