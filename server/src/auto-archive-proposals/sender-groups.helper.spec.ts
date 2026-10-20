import { AUTO_ARCHIVE_SENDER_SCOPE } from "../constants/auto-archive-proposal.constants";
import {
  domainSenderKey,
  isAutomatedAddress,
  planSenderGroups,
  toSenderIdentity,
} from "./sender-groups.helper";

describe("sender-groups.helper", () => {
  describe("isAutomatedAddress", () => {
    it.each([
      "notifications@github.com",
      "noreply@md.getsentry.com",
      "no-reply@accounts.google.com",
      "alerts+prod@pagerduty.com",
      "build.bot@ci.example.com",
    ])("recognises %s as automated", (address) => {
      expect(isAutomatedAddress(address)).toBe(true);
    });

    it.each([
      "catherine@focusbear.io",
      "botanist@garden.org",
      "jeremy.news@x.com",
    ])("does not treat %s as automated by substring accident", (address) => {
      expect(isAutomatedAddress(address)).toBe(address === "jeremy.news@x.com");
    });
  });

  describe("toSenderIdentity", () => {
    it("extracts the bare address and display name", () => {
      expect(
        toSenderIdentity("k", "GitHub <notifications@github.com>", "GitHub"),
      ).toEqual({
        senderKey: "k",
        address: "notifications@github.com",
        displayName: "GitHub",
      });
      expect(toSenderIdentity("k", "not-an-address", null)).toBeNull();
    });
  });

  describe("planSenderGroups", () => {
    const identity = (senderKey: string, address: string) => ({
      senderKey,
      address,
      displayName: null,
    });

    it("makes an address group for each heavy sender only", () => {
      const groups = planSenderGroups(
        [
          { senderKey: "gh", total: 120, newSinceScan: 9 },
          { senderKey: "alice", total: 4, newSinceScan: 1 },
        ],
        [
          identity("gh", "notifications@github.com"),
          identity("alice", "alice@acme.com"),
        ],
      );
      expect(groups).toEqual([
        {
          senderKey: "gh",
          scope: AUTO_ARCHIVE_SENDER_SCOPE.ADDRESS,
          senderPattern: "notifications@github.com",
          senderDisplay: "notifications@github.com",
          memberSenderKeys: ["gh"],
          total: 120,
          newSinceScan: 9,
        },
      ]);
    });

    it("groups light automated addresses of one host into a domain group", () => {
      const groups = planSenderGroups(
        [
          { senderKey: "a", total: 12, newSinceScan: 2 },
          { senderKey: "b", total: 11, newSinceScan: 3 },
        ],
        [
          identity("a", "alerts@status.example.com"),
          identity("b", "noreply@status.example.com"),
        ],
      );
      expect(groups).toEqual([
        expect.objectContaining({
          senderKey: domainSenderKey("status.example.com"),
          scope: AUTO_ARCHIVE_SENDER_SCOPE.DOMAIN,
          senderPattern: "*@status.example.com",
          memberSenderKeys: ["a", "b"],
          total: 23,
          newSinceScan: 5,
        }),
      ]);
    });

    it("never groups people by domain", () => {
      expect(
        planSenderGroups(
          [
            { senderKey: "a", total: 12, newSinceScan: 0 },
            { senderKey: "b", total: 12, newSinceScan: 0 },
          ],
          [identity("a", "alice@acme.com"), identity("b", "bob@acme.com")],
        ),
      ).toEqual([]);
    });
  });
});
