import {
  findMissingGooglePermissionGroups,
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  hasGooglePermission,
  isIncrementalGooglePermissionGroup,
  REQUIRED_GOOGLE_SCOPES,
  scopesForGooglePermissionGroup,
} from "./google-oauth-scopes";

const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Sign-in plus both groups granted later: everything BearlyMail can ask for. */
const FULL_GRANT = [
  ...GOOGLE_SIGN_IN_SCOPES,
  ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CALENDAR),
  ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CONTACTS),
];

describe("findMissingGooglePermissionGroups", () => {
  it("reports nothing missing for a grant of every requested scope", () => {
    expect(findMissingGooglePermissionGroups(FULL_GRANT.join(" "))).toEqual([]);
  });

  it("reports Gmail when the Gmail boxes were unticked", () => {
    const withoutGmail = FULL_GRANT.filter(
      (scope) => !REQUIRED_GOOGLE_SCOPES.includes(scope),
    );
    expect(findMissingGooglePermissionGroups(withoutGmail.join(" "))).toEqual([
      GOOGLE_PERMISSION_GROUP.GMAIL,
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

describe("GOOGLE_SIGN_IN_SCOPES", () => {
  it("asks only for the mailbox and identity, not calendar or contacts", () => {
    const optionalScopes = [
      ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CALENDAR),
      ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CONTACTS),
    ];
    expect(GOOGLE_SIGN_IN_SCOPES).toEqual(
      expect.arrayContaining(REQUIRED_GOOGLE_SCOPES),
    );
    expect(
      GOOGLE_SIGN_IN_SCOPES.filter((scope) => optionalScopes.includes(scope)),
    ).toEqual([]);
  });

  it("reports calendar and contacts as missing straight after sign-in", () => {
    expect(
      findMissingGooglePermissionGroups(GOOGLE_SIGN_IN_SCOPES.join(" ")),
    ).toEqual([
      GOOGLE_PERMISSION_GROUP.CALENDAR,
      GOOGLE_PERMISSION_GROUP.CONTACTS,
    ]);
  });
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

  it.each([null, undefined, ""])(
    "treats an unknown grant (%p) as granted, as older sign-ins asked for everything",
    (grant) => {
      expect(hasGooglePermission(grant, GOOGLE_PERMISSION_GROUP.CALENDAR)).toBe(
        true,
      );
    },
  );
});

describe("isIncrementalGooglePermissionGroup", () => {
  it.each([
    [GOOGLE_PERMISSION_GROUP.CALENDAR, true],
    [GOOGLE_PERMISSION_GROUP.CONTACTS, true],
    [GOOGLE_PERMISSION_GROUP.GMAIL, false],
    ["drive", false],
    [undefined, false],
  ])("%p → %p", (value, expected) => {
    expect(isIncrementalGooglePermissionGroup(value)).toBe(expected);
  });
});
