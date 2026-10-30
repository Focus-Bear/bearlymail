import { RELOGIN_REASONS } from "../constants/auth-constants";
import { GMAIL_ACCESS_ISSUE } from "../constants/domain-statuses";
import { resolveGmailAccessIssue } from "./gmail-access-issue";

describe("resolveGmailAccessIssue", () => {
  it("returns the recorded issue", () => {
    expect(
      resolveGmailAccessIssue({
        gmailAccessIssue: GMAIL_ACCESS_ISSUE.MISSING,
        needsRelogin: true,
        lastLogoutReason: "gmail_invalid_token",
      }),
    ).toBe(GMAIL_ACCESS_ISSUE.MISSING);
  });

  it("treats an account flagged for a Gmail re-login before the column existed as revoked", () => {
    expect(
      resolveGmailAccessIssue({
        gmailAccessIssue: null,
        needsRelogin: true,
        lastLogoutReason: "gmail_sync_auth_error",
      }),
    ).toBe(GMAIL_ACCESS_ISSUE.REVOKED);
  });

  it("treats an account flagged for a missing Gmail scope as missing access", () => {
    expect(
      resolveGmailAccessIssue({
        gmailAccessIssue: null,
        needsRelogin: true,
        lastLogoutReason: RELOGIN_REASONS.GMAIL_INSUFFICIENT_SCOPE,
      }),
    ).toBe(GMAIL_ACCESS_ISSUE.MISSING);
  });

  it("ignores a stale Gmail logout reason once the user has signed back in", () => {
    expect(
      resolveGmailAccessIssue({
        gmailAccessIssue: null,
        needsRelogin: false,
        lastLogoutReason: "gmail_sync_auth_error",
      }),
    ).toBeNull();
  });

  it("ignores re-logins that are not about Gmail", () => {
    expect(
      resolveGmailAccessIssue({
        gmailAccessIssue: null,
        needsRelogin: true,
        lastLogoutReason: "outlook_token_expired",
      }),
    ).toBeNull();
  });
});
