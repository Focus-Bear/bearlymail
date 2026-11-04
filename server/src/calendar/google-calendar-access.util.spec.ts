import {
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  scopesForGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { hasGoogleCalendarAccess } from "./google-calendar-access.util";

const SIGN_IN_GRANT = GOOGLE_SIGN_IN_SCOPES.join(" ");
const CALENDAR_GRANT = [
  ...GOOGLE_SIGN_IN_SCOPES,
  ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CALENDAR),
].join(" ");

describe("hasGoogleCalendarAccess", () => {
  it("is false for a Gmail-only sign-in that hasn't granted calendar", () => {
    expect(
      hasGoogleCalendarAccess({
        googleCalendarAccessToken: "token",
        googleGrantedScopes: SIGN_IN_GRANT,
      }),
    ).toBe(false);
  });

  it("is true once calendar has been granted", () => {
    expect(
      hasGoogleCalendarAccess({
        googleCalendarAccessToken: "token",
        googleGrantedScopes: CALENDAR_GRANT,
      }),
    ).toBe(true);
  });

  it("keeps working for older sign-ins whose grant wasn't recorded", () => {
    expect(
      hasGoogleCalendarAccess({
        googleCalendarAccessToken: "token",
        googleGrantedScopes: null,
      }),
    ).toBe(true);
  });

  it.each([null, undefined])("is false without a user (%p)", (user) => {
    expect(hasGoogleCalendarAccess(user)).toBe(false);
  });

  it("is false without a Google token", () => {
    expect(
      hasGoogleCalendarAccess({
        googleCalendarAccessToken: null,
        googleGrantedScopes: CALENDAR_GRANT,
      }),
    ).toBe(false);
  });
});
