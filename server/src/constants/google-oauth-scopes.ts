/**
 * Google OAuth scopes requested at sign-in, and the subset BearlyMail cannot
 * work without.
 */

const GOOGLE_SCOPE_GMAIL_MODIFY =
  "https://www.googleapis.com/auth/gmail.modify";
const GOOGLE_SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

export const GOOGLE_OAUTH_SCOPES = [
  "email",
  "profile",
  // Free/busy only (required for booking page availability via freebusy.query)
  "https://www.googleapis.com/auth/calendar.freebusy",
  // Manage calendar events (create/edit/delete bookings)
  "https://www.googleapis.com/auth/calendar.events",
  // Includes read + modify (labels, etc.)
  GOOGLE_SCOPE_GMAIL_MODIFY,
  GOOGLE_SCOPE_GMAIL_SEND,
  // Required for contacts sync via People API (explicit contacts)
  "https://www.googleapis.com/auth/contacts.readonly",
  // Required for "Other contacts" sync (auto-created from interactions)
  "https://www.googleapis.com/auth/contacts.other.readonly",
];

/**
 * Google's granular consent screen lets the user untick individual scopes and
 * still finish signing in. Without these two the account has no mailbox: every
 * sync 403s with insufficientPermissions and the inbox stays empty. Calendar
 * and contacts scopes stay optional — those features degrade on their own.
 */
export const REQUIRED_GOOGLE_SCOPES = [
  GOOGLE_SCOPE_GMAIL_MODIFY,
  GOOGLE_SCOPE_GMAIL_SEND,
];

/**
 * Matched by AuthController.determineOAuthErrorType to route the user to the
 * "grant Gmail access" explanation instead of a generic auth error.
 */
export const MISSING_GMAIL_PERMISSION_MESSAGE =
  "BearlyMail needs permission to read and send your Gmail. Please sign in again and allow Gmail access.";

/**
 * Returns the required scopes absent from Google's space-separated `scope`
 * token-response field. An absent field returns none: Google always sends it,
 * so treating its absence as a denial would only ever lock users out.
 */
export function findMissingRequiredGoogleScopes(
  grantedScope: string | undefined,
): string[] {
  if (grantedScope === undefined) return [];
  const granted = new Set(grantedScope.split(" "));
  return REQUIRED_GOOGLE_SCOPES.filter((scope) => !granted.has(scope));
}
