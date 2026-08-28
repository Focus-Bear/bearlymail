import { ConfigService } from "@nestjs/config";

import { Office365Client } from "../../emails/providers/office365/office365-client";
import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { Office365ContactsProvider } from "./office365-contacts.provider";

describe("Office365ContactsProvider", () => {
  let provider: Office365ContactsProvider;
  let accountsService: jest.Mocked<
    Pick<Office365AccountsService, "hasConnectedOffice365" | "findPrimary">
  >;
  let graphGet: jest.Mock;

  const primaryAccount = {
    id: "acct-1",
    accessToken: "access-token",
    refreshToken: "refresh-token",
  };

  beforeEach(() => {
    graphGet = jest.fn();
    accountsService = {
      hasConnectedOffice365: jest.fn(),
      findPrimary: jest.fn(),
    };
    // The provider builds its own Office365Client — stub its Graph client so no
    // real network calls happen.
    jest
      .spyOn(Office365Client.prototype, "createGraphClient")
      .mockReturnValue({ get: graphGet } as never);

    provider = new Office365ContactsProvider(
      accountsService as unknown as Office365AccountsService,
      {} as ConfigService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("reports connection state from the accounts service", async () => {
    accountsService.hasConnectedOffice365.mockResolvedValue(true);
    expect(await provider.isConnected("user-1")).toBe(true);
  });

  it("returns no contacts when the user has no Office 365 account", async () => {
    accountsService.findPrimary.mockResolvedValue(null);
    expect(await provider.fetchAllContacts("user-1")).toEqual([]);
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("maps Graph contacts to RawContact and dedupes by email", async () => {
    accountsService.findPrimary.mockResolvedValue(primaryAccount as never);
    graphGet
      // token validation (`GET /me`)
      .mockResolvedValueOnce({ data: { id: "me" } })
      // `GET /me/contacts...`
      .mockResolvedValueOnce({
        data: {
          value: [
            {
              id: "c1",
              displayName: "Ada Lovelace",
              givenName: "Ada",
              surname: "Lovelace",
              emailAddresses: [{ address: "Ada@Example.com" }],
              businessPhones: ["+123"],
              companyName: "Analytical Engine",
              jobTitle: "Mathematician",
            },
            {
              id: "c2",
              displayName: "Ada Dupe",
              emailAddresses: [{ address: "ada@example.com" }],
            },
            {
              id: "c3",
              displayName: "No Email",
              emailAddresses: [],
            },
          ],
        },
      });

    const contacts = await provider.fetchAllContacts("user-1");

    expect(contacts).toEqual([
      {
        providerId: "c1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "+123",
        company: "Analytical Engine",
        jobTitle: "Mathematician",
      },
    ]);
  });

  it("follows @odata.nextLink pagination", async () => {
    accountsService.findPrimary.mockResolvedValue(primaryAccount as never);
    graphGet
      .mockResolvedValueOnce({ data: { id: "me" } })
      .mockResolvedValueOnce({
        data: {
          value: [
            { id: "c1", emailAddresses: [{ address: "one@example.com" }] },
          ],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/contacts?page=2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          value: [
            { id: "c2", emailAddresses: [{ address: "two@example.com" }] },
          ],
        },
      });

    const contacts = await provider.fetchAllContacts("user-1");

    expect(contacts.map((contact) => contact.email)).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
    // /me validation + 2 contact pages
    expect(graphGet).toHaveBeenCalledTimes(3);
  });

  it("syncContacts returns the number of fetched contacts", async () => {
    accountsService.findPrimary.mockResolvedValue(primaryAccount as never);
    graphGet
      .mockResolvedValueOnce({ data: { id: "me" } })
      .mockResolvedValueOnce({
        data: {
          value: [
            { id: "c1", emailAddresses: [{ address: "one@example.com" }] },
          ],
        },
      });

    expect(await provider.syncContacts("user-1")).toBe(1);
  });
});
