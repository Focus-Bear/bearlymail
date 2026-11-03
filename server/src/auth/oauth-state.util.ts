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
  /** Google permission group being granted (GRANT_GOOGLE_PERMISSION only). */
  permission?: string;
  /** App path to return to once the grant completes (GRANT_GOOGLE_PERMISSION only). */
  returnTo?: string;
}

export interface ParsedOAuthState {
  action: string;
  userId: string;
  permission?: string;
  returnTo?: string;
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

function encodeSignedState(payload: OAuthStatePayload): string {
  const payloadJson = JSON.stringify(payload);
  const body = Buffer.from(payloadJson).toString("base64url");
  return `${body}.${sign(payloadJson)}`;
}

/** Builds a signed, timestamped connect-state for the given user. */
export function createConnectState(userId: string): string {
  return encodeSignedState({
    userId,
    action: AUTH_ACTION_TYPES.CONNECT,
    iat: Date.now(),
  });
}

/**
 * Builds the signed state for an incremental Google grant. Signing matters
 * here too: the callback trusts `userId` to decide whose grant was extended
 * and `returnTo` to decide where to send the browser.
 */
export function createGooglePermissionState(
  userId: string,
  permission: string,
  returnTo: string,
): string {
  return encodeSignedState({
    userId,
    action: AUTH_ACTION_TYPES.GRANT_GOOGLE_PERMISSION,
    iat: Date.now(),
    permission,
    returnTo,
  });
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Verifies and decodes a signed connect-state. Returns null on any tampering,
 * signature mismatch, expiry, or malformed input — callers must treat null as
 * "reject this callback".
 */
export function parseSignedOAuthState(state: string): ParsedOAuthState | null {
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

    const permission = optionalString(payload.permission);
    const returnTo = optionalString(payload.returnTo);
    return {
      action: payload.action,
      userId: payload.userId,
      ...(permission !== undefined ? { permission } : {}),
      ...(returnTo !== undefined ? { returnTo } : {}),
    };
  } catch {
    return null;
  }
}
