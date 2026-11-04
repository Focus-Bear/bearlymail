/**
 * Google OAuth scopes requested at sign-in, and the subset BearlyMail cannot
 * work without.
 */

const GOOGLE_SCOPE_GMAIL_MODIFY =
  "https://www.googleapis.com/auth/gmail.modify";
const GOOGLE_SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
// Free/busy only (required for booking page availability via freebusy.query)
const GOOGLE_SCOPE_CALENDAR_FREEBUSY =
  "https://www.googleapis.com/auth/calendar.freebusy";
// Manage calendar events (create/edit/delete bookings)
const GOOGLE_SCOPE_CALENDAR_EVENTS =
  "https://www.googleapis.com/auth/calendar.events";
// Required for contacts sync via People API (explicit contacts)
const GOOGLE_SCOPE_CONTACTS =
  "https://www.googleapis.com/auth/contacts.readonly";
// Required for "Other contacts" sync (auto-created from interactions)
const GOOGLE_SCOPE_OTHER_CONTACTS =
  "https://www.googleapis.com/auth/contacts.other.readonly";

export const GOOGLE_OAUTH_SCOPES = [
  "email",
  "profile",
  GOOGLE_SCOPE_CALENDAR_FREEBUSY,
  GOOGLE_SCOPE_CALENDAR_EVENTS,
  // Includes read + modify (labels, etc.)
  GOOGLE_SCOPE_GMAIL_MODIFY,
  GOOGLE_SCOPE_GMAIL_SEND,
  GOOGLE_SCOPE_CONTACTS,
  GOOGLE_SCOPE_OTHER_CONTACTS,
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

/**
 * The features behind the checkboxes on Google's consent screen. The values
 * are part of the API contract with the client (client/src/constants/strings.ts),
 * which names what stops working when one is missing.
 */
export const GOOGLE_PERMISSION_GROUP = {
  GMAIL: "gmail",
  CALENDAR: "calendar",
  CONTACTS: "contacts",
} as const;

export type GooglePermissionGroup =
  (typeof GOOGLE_PERMISSION_GROUP)[keyof typeof GOOGLE_PERMISSION_GROUP];

const GOOGLE_PERMISSION_GROUP_SCOPES: Record<GooglePermissionGroup, string[]> =
  {
    [GOOGLE_PERMISSION_GROUP.GMAIL]: REQUIRED_GOOGLE_SCOPES,
    [GOOGLE_PERMISSION_GROUP.CALENDAR]: [
      GOOGLE_SCOPE_CALENDAR_FREEBUSY,
      GOOGLE_SCOPE_CALENDAR_EVENTS,
    ],
    [GOOGLE_PERMISSION_GROUP.CONTACTS]: [
      GOOGLE_SCOPE_CONTACTS,
      GOOGLE_SCOPE_OTHER_CONTACTS,
    ],
  };

/**
 * The permission groups with at least one scope absent from the grant
 * recorded at the last Google sign-in. An unknown grant (non-Google accounts,
 * and Google sign-ins from before scopes were recorded) reports none, so no
 * one is warned about a permission they may well have given.
 */
export function findMissingGooglePermissionGroups(
  grantedScope: string | null | undefined,
): GooglePermissionGroup[] {
  if (!grantedScope) return [];
  const granted = new Set(grantedScope.split(" "));
  return (
    Object.keys(GOOGLE_PERMISSION_GROUP_SCOPES) as GooglePermissionGroup[]
  ).filter((group) =>
    GOOGLE_PERMISSION_GROUP_SCOPES[group].some((scope) => !granted.has(scope)),
  );
}
