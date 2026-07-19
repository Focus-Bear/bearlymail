import { createHmac, timingSafeEqual } from "crypto";

import { AUTH_ACTION_TYPES } from "../constants/domain-types";
import { MILLISECONDS } from "../constants/time-constants";

/**
 * OAuth "connect" state is round-tripped through the provider (Google /
 * Microsoft / Zoho) and comes back attacker-reachable in the callback URL.
 * If it were plain base64 JSON, an authenticated user could hand-craft a
 * state naming a *different* userId and graft a mailbox onto someone else's
 * account (account-linking CSRF). We therefore HMAC-sign the payload with a
 * server secret and reject any state whose signature doesn't verify.
 *
 * Format: `base64url(payloadJson).base64url(hmacSha256(payloadJson))`
 */

/** OAuth flows complete in seconds; allow an hour of slack for slow consent. */
const STATE_TTL_MS = MILLISECONDS.HOUR;

interface OAuthStatePayload {
  userId: string;
  action: string;
  iat: number;
}

/**
 * Secret used to sign OAuth connect-state. JWT_SECRET is validated as required
 * at boot (see config/env.validation.ts), so it is guaranteed present in every
 * real environment; the throw guards against a misconfigured process.
 */
function getStateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required to sign OAuth state");
  }
  return secret;
}

function sign(payloadJson: string): string {
  return createHmac("sha256", getStateSecret())
    .update(payloadJson)
    .digest("base64url");
}

/** Builds a signed, timestamped connect-state for the given user. */
export function createConnectState(userId: string): string {
  const payload: OAuthStatePayload = {
    userId,
    action: AUTH_ACTION_TYPES.CONNECT,
    iat: Date.now(),
  };
  const payloadJson = JSON.stringify(payload);
  const body = Buffer.from(payloadJson).toString("base64url");
  return `${body}.${sign(payloadJson)}`;
}

/**
 * Verifies and decodes a signed connect-state. Returns null on any tampering,
 * signature mismatch, expiry, or malformed input — callers must treat null as
 * "reject this callback".
 */
export function parseSignedOAuthState(
  state: string,
): { action: string; userId: string } | null {
  try {
    // Exactly two parts — reject `body.sig.extra` so trailing data can't be
    // smuggled past a valid signature.
    const parts = state.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    if (!body || !signature) return null;

    const payloadJson = Buffer.from(body, "base64url").toString();
    const expected = sign(payloadJson);

    const provided = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (
      provided.length !== expectedBuf.length ||
      !timingSafeEqual(provided, expectedBuf)
    ) {
      return null;
    }

    const payload = JSON.parse(payloadJson) as OAuthStatePayload | null;
    if (
      !payload ||
      typeof payload.userId !== "string" ||
      typeof payload.action !== "string" ||
      typeof payload.iat !== "number" ||
      Date.now() - payload.iat > STATE_TTL_MS
    ) {
      return null;
    }

    return { action: payload.action, userId: payload.userId };
  } catch {
    return null;
  }
}
