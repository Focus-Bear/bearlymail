import { UnauthorizedException } from "@nestjs/common";

import { NODE_ENV_VALUES } from "../constants/domain-types";

/** Hostnames that count as "running on this machine". */
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Peer addresses of a connection that started on this machine. */
const LOOPBACK_ADDRESS =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

/** The parts of a request that say where it really came from. */
export interface LocalRequestOrigin {
  /** From the Host header, so the caller chooses it. */
  hostname: string | undefined;
  /** The TCP peer address (`req.socket.remoteAddress`), which they cannot. */
  remoteAddress: string | undefined;
}

/**
 * Whether the passwordless "Continue with Apple Mail" login may be used.
 * Gated so it can never be an auth bypass in a deployed environment: not
 * production, the connection itself comes from this machine (the Host header
 * alone proves nothing — any client can send `Host: localhost`), and Apple
 * Mail is actually available (which requires the server to run on macOS).
 */
export function isLocalAppleMailMode(
  origin: LocalRequestOrigin,
  appleMailAvailable: boolean,
): boolean {
  const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
  const isLocalHost = LOCALHOST_HOSTNAMES.has(
    (origin.hostname || "").toLowerCase(),
  );
  const isLoopbackPeer = LOOPBACK_ADDRESS.test(origin.remoteAddress || "");
  return !isProduction && isLocalHost && isLoopbackPeer && appleMailAvailable;
}

export function assertLocalAppleMailMode(
  origin: LocalRequestOrigin,
  appleMailAvailable: boolean,
): void {
  if (!isLocalAppleMailMode(origin, appleMailAvailable)) {
    throw new UnauthorizedException(
      "Apple Mail local login is only available when running BearlyMail locally on macOS",
    );
  }
}
