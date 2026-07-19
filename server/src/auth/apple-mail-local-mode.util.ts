import { UnauthorizedException } from "@nestjs/common";

import { NODE_ENV_VALUES } from "../constants/domain-types";

/** Hostnames that count as "running on this machine". */
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Whether the passwordless "Continue with Apple Mail" login may be used.
 * Triple-gated so it can never be an auth bypass in a deployed environment:
 * not production, called on localhost, and Apple Mail actually available
 * (which requires the server to be running on macOS).
 */
export function isLocalAppleMailMode(
  hostname: string | undefined,
  appleMailAvailable: boolean,
): boolean {
  const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
  const isLocalHost = LOCALHOST_HOSTNAMES.has((hostname || "").toLowerCase());
  return !isProduction && isLocalHost && appleMailAvailable;
}

export function assertLocalAppleMailMode(
  hostname: string | undefined,
  appleMailAvailable: boolean,
): void {
  if (!isLocalAppleMailMode(hostname, appleMailAvailable)) {
    throw new UnauthorizedException(
      "Apple Mail local login is only available when running BearlyMail locally on macOS",
    );
  }
}
