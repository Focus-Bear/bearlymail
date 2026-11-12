import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { CookieOptions, Request, Response } from "express";

import { AUTH_ACTION_TYPES, NODE_ENV_VALUES } from "../constants/domain-types";
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
  /** CONNECT only: must equal the browser's connect-binding cookie. */
  nonce?: string;
}

export interface ParsedOAuthState {
  action: string;
  userId: string;
  permission?: string;
  returnTo?: string;
  nonce?: string;
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

/** HttpOnly cookie tying a connect flow to the browser that started it. */
export const CONNECT_BINDING_COOKIE = "bm_oauth_connect";
const CONNECT_NONCE_BYTES = 32;

function connectBindingCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION,
    // Lax, not Strict: the callback is a top-level redirect from the provider.
    sameSite: "lax",
    maxAge: STATE_TTL_MS,
    path: "/",
  };
}

/**
 * Builds a signed, timestamped connect-state for the given user and sets the
 * matching binding cookie on this browser. The signature alone stops a forged
 * userId, but not an attacker handing a victim their *own* valid connect link:
 * the victim would authorise their mailbox and it would land in the
 * attacker's account. The callback therefore also requires the cookie, which
 * only the browser that asked for the link has.
 */
export function createConnectState(userId: string, res: Response): string {
  const nonce = randomBytes(CONNECT_NONCE_BYTES).toString("base64url");
  res.cookie(CONNECT_BINDING_COOKIE, nonce, connectBindingCookieOptions());
  return encodeSignedState({
    userId,
    action: AUTH_ACTION_TYPES.CONNECT,
    iat: Date.now(),
    nonce,
  });
}

function readCookie(
  req: Pick<Request, "headers">,
  name: string,
): string | null {
  for (const part of (req.headers?.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

/**
 * True when a parsed CONNECT state was started by this browser: its nonce
 * matches the binding cookie. A state without a nonce never passes.
 */
export function isConnectStateBoundToBrowser(
  state: ParsedOAuthState,
  req: Pick<Request, "headers">,
): boolean {
  const cookie = readCookie(req, CONNECT_BINDING_COOKIE);
  if (!state.nonce || !cookie) return false;
  const expected = Buffer.from(state.nonce);
  const provided = Buffer.from(cookie);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
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
    const nonce = optionalString(payload.nonce);
    return {
      action: payload.action,
      userId: payload.userId,
      ...(permission !== undefined ? { permission } : {}),
      ...(returnTo !== undefined ? { returnTo } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Parses a callback's state, dropping a CONNECT state this browser didn't
 * start. The callback then treats it as an ordinary sign-in, so a connect
 * link handed over by someone else can't graft the victim's mailbox onto
 * their account.
 */
export function parseBrowserBoundOAuthState(
  state: string,
  req: Pick<Request, "headers">,
): ParsedOAuthState | null {
  const parsed = parseSignedOAuthState(state);
  if (
    parsed?.action === AUTH_ACTION_TYPES.CONNECT &&
    !isConnectStateBoundToBrowser(parsed, req)
  ) {
    return null;
  }
  return parsed;
}
