import {
  findMissingGooglePermissionGroups,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_PERMISSION_GROUP,
  REQUIRED_GOOGLE_SCOPES,
} from "./google-oauth-scopes";

const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

describe("findMissingGooglePermissionGroups", () => {
  it("reports nothing missing for a grant of every requested scope", () => {
    expect(
      findMissingGooglePermissionGroups(GOOGLE_OAUTH_SCOPES.join(" ")),
    ).toEqual([]);
  });

  it("reports Gmail when the Gmail boxes were unticked", () => {
    const withoutGmail = GOOGLE_OAUTH_SCOPES.filter(
      (scope) => !REQUIRED_GOOGLE_SCOPES.includes(scope),
    );
    expect(findMissingGooglePermissionGroups(withoutGmail.join(" "))).toEqual([
      GOOGLE_PERMISSION_GROUP.GMAIL,
    ]);
  });

  it("reports a group as missing when only part of it was granted", () => {
    const withoutCalendarEvents = GOOGLE_OAUTH_SCOPES.filter(
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
