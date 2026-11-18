import { createInMemoryMatchRepo } from "./bigin/__fixtures__/bigin.fixture";
import {
  connectionFingerprint,
  CrmSenderMatchStore,
} from "./crm-sender-match.store";

const KEY = { userId: "user-1", serverId: "server-1", emailHash: "hash-1" };
const CONNECTION = {
  serverUrl: "https://acme-123.zohomcp.com/mcp/key/message",
  oauthMetadata: null,
};

describe("connectionFingerprint", () => {
  it("is stable for one connection and differs for another org or data centre", () => {
    const base = connectionFingerprint(CONNECTION);

    expect(connectionFingerprint({ ...CONNECTION })).toBe(base);
    expect(
      connectionFingerprint({
        ...CONNECTION,
        serverUrl: "https://other-456.zohomcp.com/mcp/key2/message",
      }),
    ).not.toBe(base);
    expect(
      connectionFingerprint({
        ...CONNECTION,
        oauthMetadata: {
          issuer: "https://accounts.zoho.eu",
          authorizationEndpoint: "https://accounts.zoho.eu/oauth/v2/auth",
          tokenEndpoint: "https://accounts.zoho.eu/oauth/v2/token",
        },
      }),
    ).not.toBe(base);
  });
});

describe("CrmSenderMatchStore", () => {
  const fingerprint = connectionFingerprint(CONNECTION);

  it("saves, finds and forgets a match", async () => {
    const { repo, asRepository } = createInMemoryMatchRepo();
    const store = new CrmSenderMatchStore(asRepository);

    await store.saveMatch(KEY, fingerprint, {
      recordModule: "Contacts",
      recordId: "contact-1",
      displayName: "Ada Lovelace",
      matchCount: 1,
    });

    await expect(store.find(KEY, fingerprint)).resolves.toMatchObject({
      recordId: "contact-1",
      displayName: "Ada Lovelace",
    });
    await store.forget(KEY);
    expect(repo.rows).toEqual([]);
  });

  it("replaces a miss with a match in place (one row per sender and connection)", async () => {
    const { repo, asRepository } = createInMemoryMatchRepo();
    const store = new CrmSenderMatchStore(asRepository);

    await store.saveMiss(KEY, fingerprint);
    await store.saveMatch(KEY, fingerprint, {
      recordModule: "Contacts",
      recordId: "contact-1",
      displayName: "Ada",
      matchCount: 1,
    });

    expect(repo.rows).toHaveLength(1);
    expect(repo.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordId: "contact-1" }),
      ["userId", "serverId", "emailHash"],
    );
  });

  it("does not return a match recorded under a different connection fingerprint", async () => {
    const { asRepository } = createInMemoryMatchRepo();
    const store = new CrmSenderMatchStore(asRepository);
    await store.saveMiss(KEY, fingerprint);

    await expect(store.find(KEY, "another-fingerprint")).resolves.toBeNull();
  });
});
