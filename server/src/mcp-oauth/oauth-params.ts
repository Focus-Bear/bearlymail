import { OAUTH_ERROR_CODES } from "../constants/mcp-oauth.constants";
import { OAuthError } from "./oauth-error";

/**
 * Reads one OAuth request parameter (query string or form body). RFC 6749
 * §3.1: a parameter sent more than once makes the request invalid.
 */
export function readSingleParam(
  params: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = params[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new OAuthError(
      OAUTH_ERROR_CODES.INVALID_REQUEST,
      `${name} must be given exactly once`,
    );
  }
  return value;
}

/** Same as readSingleParam, but the parameter must be present. */
export function requireParam(
  params: Record<string, unknown>,
  name: string,
): string {
  const value = readSingleParam(params, name);
  if (value === undefined) {
    throw new OAuthError(
      OAUTH_ERROR_CODES.INVALID_REQUEST,
      `${name} is required`,
    );
  }
  return value;
}

/** The redirect back to the client, with `code` or `error`, plus `state` and `iss` (RFC 9207). */
export function buildAuthorizationRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
