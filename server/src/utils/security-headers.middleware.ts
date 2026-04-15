import { NextFunction, Request, Response } from "express";

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
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  res.removeHeader("X-Powered-By");
  next();
}
