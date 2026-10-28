import {
  GMAIL_ACCESS_ISSUE,
  GmailAccessIssue,
} from "../constants/domain-statuses";
import { User } from "../database/entities/user.entity";

/** Every Gmail path that flags needsRelogin uses a `gmail_…` reason code. */
const GMAIL_RELOGIN_REASON_PREFIX = "gmail_";

/**
 * The Gmail access problem to show the user, if any. A recorded issue wins.
 * Accounts flagged for re-login before `gmailAccessIssue` existed never get
 * one recorded — needsRelogin skips their fetches — so a Gmail logout reason
 * stands in for it; the client copy covers both causes.
 */
export function resolveGmailAccessIssue(
  user: Pick<User, "gmailAccessIssue" | "needsRelogin" | "lastLogoutReason">,
): GmailAccessIssue | null {
  if (user.gmailAccessIssue) return user.gmailAccessIssue;
  const isFlaggedForGmail =
    user.needsRelogin &&
    !!user.lastLogoutReason?.startsWith(GMAIL_RELOGIN_REASON_PREFIX);
  return isFlaggedForGmail ? GMAIL_ACCESS_ISSUE.REVOKED : null;
}
