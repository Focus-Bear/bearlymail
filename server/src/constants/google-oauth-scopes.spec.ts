import {
  findMissingGooglePermissionGroups,
  findMissingRequiredGoogleScopes,
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  hasGooglePermission,
  isIncrementalGooglePermissionGroup,
  REQUIRED_GOOGLE_SCOPES,
  scopesForGooglePermissionGroup,
} from "./google-oauth-scopes";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const MANAGE_SCOPES = scopesForGooglePermissionGroup(
  GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
);
const SEND_SCOPES = scopesForGooglePermissionGroup(
  GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
);
const CALENDAR_SCOPES = scopesForGooglePermissionGroup(
  GOOGLE_PERMISSION_GROUP.CALENDAR,
);
const CONTACTS_SCOPES = scopesForGooglePermissionGroup(
  GOOGLE_PERMISSION_GROUP.CONTACTS,
);

/** Sign-in plus every group granted later: everything BearlyMail can ask for. */
const FULL_GRANT = [
  ...GOOGLE_SIGN_IN_SCOPES,
  ...MANAGE_SCOPES,
  ...SEND_SCOPES,
  ...CALENDAR_SCOPES,
  ...CONTACTS_SCOPES,
];

/** What sign-in asked for before it went read-only (still held by those users). */
const PRE_READONLY_SIGN_IN_GRANT = [
  "email",
  "profile",
  GMAIL_MODIFY_SCOPE,
  GMAIL_SEND_SCOPE,
].join(" ");

describe("scope stages", () => {
  it("sign-in asks for read-only Gmail and identity, nothing that changes or sends mail", () => {
    expect(GOOGLE_SIGN_IN_SCOPES).toEqual([
      "email",
      "profile",
      GMAIL_READONLY_SCOPE,
    ]);
    expect(REQUIRED_GOOGLE_SCOPES).toEqual([GMAIL_READONLY_SCOPE]);
  });

  it("asks for gmail.modify on the first change and gmail.send on the first send", () => {
    expect(MANAGE_SCOPES).toEqual([GMAIL_MODIFY_SCOPE]);
    expect(SEND_SCOPES).toEqual([GMAIL_SEND_SCOPE]);
  });

  it("keeps calendar and contacts out of sign-in", () => {
    expect(
      GOOGLE_SIGN_IN_SCOPES.filter((scope) =>
        [...CALENDAR_SCOPES, ...CONTACTS_SCOPES].includes(scope),
      ),
    ).toEqual([]);
  });
});

describe("findMissingRequiredGoogleScopes", () => {
  it("accepts a read-only grant", () => {
    expect(
      findMissingRequiredGoogleScopes(GOOGLE_SIGN_IN_SCOPES.join(" ")),
    ).toEqual([]);
  });

  it("accepts a pre-read-only grant: gmail.modify covers reading", () => {
    expect(findMissingRequiredGoogleScopes(PRE_READONLY_SIGN_IN_GRANT)).toEqual(
      [],
    );
  });

  it("rejects a grant with no way to read Gmail", () => {
    expect(
      findMissingRequiredGoogleScopes(`email profile ${GMAIL_SEND_SCOPE}`),
    ).toEqual([GMAIL_READONLY_SCOPE]);
  });
});

describe("findMissingGooglePermissionGroups", () => {
  it("reports nothing missing for a grant of every requested scope", () => {
    expect(findMissingGooglePermissionGroups(FULL_GRANT.join(" "))).toEqual([]);
  });

  it("reports Gmail when the Gmail box was unticked", () => {
    const withoutGmail = FULL_GRANT.filter(
      (scope) => scope !== GMAIL_READONLY_SCOPE && scope !== GMAIL_MODIFY_SCOPE,
    );
    expect(findMissingGooglePermissionGroups(withoutGmail.join(" "))).toEqual([
      GOOGLE_PERMISSION_GROUP.GMAIL,
      GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
    ]);
  });

  it("does not flag a read-only user as missing Gmail; manage and send are on demand", () => {
    expect(
      findMissingGooglePermissionGroups(GOOGLE_SIGN_IN_SCOPES.join(" ")),
    ).toEqual([
      GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
      GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
      GOOGLE_PERMISSION_GROUP.CALENDAR,
      GOOGLE_PERMISSION_GROUP.CONTACTS,
    ]);
  });

  it("leaves an existing modify+send user with nothing Gmail-related to grant", () => {
    expect(
      findMissingGooglePermissionGroups(PRE_READONLY_SIGN_IN_GRANT),
    ).toEqual([
      GOOGLE_PERMISSION_GROUP.CALENDAR,
      GOOGLE_PERMISSION_GROUP.CONTACTS,
    ]);
  });

  it("reports a group as missing when only part of it was granted", () => {
    const withoutCalendarEvents = FULL_GRANT.filter(
      (scope) => scope !== CALENDAR_EVENTS_SCOPE,
    );
    expect(
      findMissingGooglePermissionGroups(withoutCalendarEvents.join(" ")),
    ).toEqual([GOOGLE_PERMISSION_GROUP.CALENDAR]);
  });

  it.each([null, undefined, ""])(
    "treats an unknown grant (%p) as complete so no one is wrongly warned",
    (grant) => {
      expect(findMissingGooglePermissionGroups(grant)).toEqual([]);
    },
  );
});

describe("hasGooglePermission", () => {
  it("is false for a group not in the grant", () => {
    expect(
      hasGooglePermission(
        GOOGLE_SIGN_IN_SCOPES.join(" "),
        GOOGLE_PERMISSION_GROUP.CALENDAR,
      ),
    ).toBe(false);
  });

  it("is true once every scope of the group is granted", () => {
    expect(
      hasGooglePermission(
        FULL_GRANT.join(" "),
        GOOGLE_PERMISSION_GROUP.CONTACTS,
      ),
    ).toBe(true);
  });

  it("lets gmail.modify cover sending, so a user who granted manage first isn't asked again", () => {
    const readonlyThenManage = [...GOOGLE_SIGN_IN_SCOPES, ...MANAGE_SCOPES];
    expect(
      hasGooglePermission(
        readonlyThenManage.join(" "),
        GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
      ),
    ).toBe(true);
  });

  it("does not let gmail.send cover changing the mailbox", () => {
    const readonlyThenSend = [...GOOGLE_SIGN_IN_SCOPES, ...SEND_SCOPES];
    expect(
      hasGooglePermission(
        readonlyThenSend.join(" "),
        GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
      ),
    ).toBe(false);
  });

  it.each([null, undefined, ""])(
    "treats an unknown grant (%p) as granted, as older sign-ins asked for everything",
    (grant) => {
      expect(
        hasGooglePermission(grant, GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE),
      ).toBe(true);
    },
  );
});

describe("isIncrementalGooglePermissionGroup", () => {
  it.each([
    [GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE, true],
    [GOOGLE_PERMISSION_GROUP.GMAIL_SEND, true],
    [GOOGLE_PERMISSION_GROUP.CALENDAR, true],
    [GOOGLE_PERMISSION_GROUP.CONTACTS, true],
    [GOOGLE_PERMISSION_GROUP.GMAIL, false],
    ["drive", false],
    [undefined, false],
  ])("%p → %p", (value, expected) => {
    expect(isIncrementalGooglePermissionGroup(value)).toBe(expected);
  });
});
