import { google } from "googleapis";

import {
  IncrementalGooglePermissionGroup,
  scopesForGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { createGooglePermissionState } from "./oauth-state.util";

/** Where a grant returns to when the requested path is missing or unsafe. */
export const DEFAULT_GRANT_RETURN_PATH = "/inbox";

const MAX_RETURN_PATH_LENGTH = 512;

/** Query parameter the app reads after a grant to say how it went. */
export const GOOGLE_PERMISSION_RESULT_PARAM = "googlePermission";

export const GOOGLE_PERMISSION_RESULT = {
  GRANTED: "granted",
  /** Google returned without the group, e.g. its boxes were left unticked. */
  DECLINED: "declined",
  /** The user picked a different Google account from the one signed in. */
  WRONG_ACCOUNT: "wrong_account",
} as const;

export type GooglePermissionResult =
  (typeof GOOGLE_PERMISSION_RESULT)[keyof typeof GOOGLE_PERMISSION_RESULT];

/**
 * Only an in-app path is accepted, so the signed state can't be turned into an
 * open redirect: it must start with one slash (not `//host`) and carry no
 * backslashes, which some browsers treat as slashes.
 */
export function sanitizeReturnPath(rawPath: unknown): string {
  if (
    typeof rawPath !== "string" ||
    rawPath.length > MAX_RETURN_PATH_LENGTH ||
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    rawPath.includes("\\")
  ) {
    return DEFAULT_GRANT_RETURN_PATH;
  }
  return rawPath;
}

/**
 * Google consent URL asking only for one more permission group. With
 * include_granted_scopes the resulting token covers everything granted so far,
 * so the callback records the full grant; login_hint pre-selects the account
 * the user is signed in with.
 */
export function buildGooglePermissionGrantUrl(options: {
  userId: string;
  email: string | undefined;
  permission: IncrementalGooglePermissionGroup;
  returnTo: string;
}): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: scopesForGooglePermissionGroup(options.permission),
    state: createGooglePermissionState(
      options.userId,
      options.permission,
      sanitizeReturnPath(options.returnTo),
    ),
    ...(options.email ? { login_hint: options.email } : {}),
  });
}

/** The app URL the callback sends the browser back to, tagged with the outcome. */
export function buildGrantReturnUrl(
  frontendUrl: string,
  returnTo: string | undefined,
  result: GooglePermissionResult,
): string {
  const url = new URL(sanitizeReturnPath(returnTo), frontendUrl);
  url.searchParams.set(GOOGLE_PERMISSION_RESULT_PARAM, result);
  return url.toString();
}
