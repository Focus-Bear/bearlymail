import { google } from "googleapis";

import {
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  scopesForGooglePermissionGroup,
} from "../../constants/google-oauth-scopes";
import { GmailContactsProvider } from "./gmail-contacts.provider";

jest.mock("googleapis", () => {
  const people = jest.fn();
  class OAuth2 {
    setCredentials = jest.fn();
    on = jest.fn();
  }
  return { google: { people, auth: { OAuth2 } } };
});

const USER_ID = "user-1";

describe("GmailContactsProvider without the contacts grant", () => {
  const usersService = { findOne: jest.fn(), update: jest.fn() };
  const provider = new GmailContactsProvider(usersService as never);

  const givenGrant = (grantedScopes: string | null) =>
    usersService.findOne.mockResolvedValue({
      id: USER_ID,
      googleCalendarAccessToken: "access",
      googleCalendarRefreshToken: "refresh",
      googleGrantedScopes: grantedScopes,
    });

  const peopleList = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    peopleList.mockResolvedValue({ data: { connections: [] } });
    jest.mocked(google.people).mockReturnValue({
      people: { connections: { list: peopleList } },
      otherContacts: {
        list: jest.fn().mockResolvedValue({ data: { otherContacts: [] } }),
      },
    } as never);
  });

  it("skips the People API after a Gmail-only sign-in", async () => {
    givenGrant(GOOGLE_SIGN_IN_SCOPES.join(" "));

    await expect(provider.fetchAllContacts(USER_ID)).resolves.toEqual([]);
    await expect(provider.searchContacts(USER_ID, "dana")).resolves.toEqual([]);
    expect(google.people).not.toHaveBeenCalled();
  });

  it("imports Google contacts once contacts are granted", async () => {
    givenGrant(
      [
        ...GOOGLE_SIGN_IN_SCOPES,
        ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.CONTACTS),
      ].join(" "),
    );

    await provider.fetchAllContacts(USER_ID);

    expect(peopleList).toHaveBeenCalled();
  });
});
