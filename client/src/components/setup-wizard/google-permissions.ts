import { GMAIL_ACCESS_ISSUE_REVOKED, GOOGLE_PERMISSION_GMAIL, GooglePermissionGroup } from 'constants/strings';
import { User } from 'contexts/AuthContext';

export const GMAIL_PERMISSION_PROBLEM = {
  /** Gmail boxes left unticked on Google's consent screen. */
  UNTICKED: 'unticked',
  /** The grant was revoked or expired after it was given. */
  REVOKED: 'revoked',
} as const;
export type GmailPermissionProblem = (typeof GMAIL_PERMISSION_PROBLEM)[keyof typeof GMAIL_PERMISSION_PROBLEM];

export interface GooglePermissionsState {
  gmailProblem: GmailPermissionProblem | null;
  /** Calendar / contacts: features degrade without them, the inbox still works. */
  missingOptional: GooglePermissionGroup[];
}

type GooglePermissionFields = Pick<User, 'gmailAccessIssue' | 'missingGooglePermissions'>;

function resolveGmailProblem(user: GooglePermissionFields, missing: GooglePermissionGroup[]): GmailPermissionProblem | null {
  if (user.gmailAccessIssue === GMAIL_ACCESS_ISSUE_REVOKED) {
    return GMAIL_PERMISSION_PROBLEM.REVOKED;
  }
  if (user.gmailAccessIssue || missing.includes(GOOGLE_PERMISSION_GMAIL)) {
    return GMAIL_PERMISSION_PROBLEM.UNTICKED;
  }
  return null;
}

/**
 * What the onboarding welcome screen should warn about. Combines the grant
 * recorded at sign-in with the access issue a failed Gmail sync records, so
 * a mailbox BearlyMail can't read is never shown as "connected".
 */
export function resolveGooglePermissions(user: GooglePermissionFields | null): GooglePermissionsState {
  if (!user) {
    return { gmailProblem: null, missingOptional: [] };
  }
  const missing = user.missingGooglePermissions ?? [];
  return {
    gmailProblem: resolveGmailProblem(user, missing),
    missingOptional: missing.filter(group => group !== GOOGLE_PERMISSION_GMAIL),
  };
}
