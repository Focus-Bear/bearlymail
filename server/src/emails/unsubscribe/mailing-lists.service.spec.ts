import { Repository } from "typeorm";

import { BlockedSendersService } from "../../blocked-senders/blocked-senders.service";
import { MILLISECONDS } from "../../constants/time-constants";
import {
  UNSUBSCRIBE,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_SOURCES,
} from "../../constants/unsubscribe.constants";
import { Email } from "../../database/entities/email.entity";
import { EncryptionHelper } from "../../encryption/encryption.helper";
import { UnsubscribeOptions } from "./list-unsubscribe.parser";
import {
  emailsPerWeek,
  MailingListsService,
  senderAddressOf,
} from "./mailing-lists.service";

const USER_ID = "user-1";
const NOW = new Date("2026-11-24T00:00:00.000Z");
const { DAY } = MILLISECONDS;

const ONE_CLICK: UnsubscribeOptions = {
  httpsUrl: "https://lists.example.test/u?t=1",
  oneClick: true,
  source: UNSUBSCRIBE_SOURCES.HEADER,
};
const MAILTO_ONLY: UnsubscribeOptions = {
  mailto: { address: "leave@lists.example.test" },
  oneClick: false,
  source: UNSUBSCRIBE_SOURCES.HEADER,
};

/** A raw row as the SQL returns it; "encrypted" values are plain here. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    emailId: "email-1",
    from: "news@paragon.test",
    fromName: "Paragon",
    unsubscribeOptions: JSON.stringify(ONE_CLICK),
    emailCount: 12,
    triageThreadCount: 4,
    firstReceivedAt: new Date(NOW.getTime() - 28 * DAY),
    lastReceivedAt: new Date(NOW.getTime() - DAY),
    ...overrides,
  };
}

describe("MailingListsService", () => {
  let query: jest.Mock;
  let getBlockedSenders: jest.Mock;
  let service: MailingListsService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([row()]);
    getBlockedSenders = jest.fn().mockResolvedValue([]);
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((value) => value ?? null);
    service = new MailingListsService(
      { query } as unknown as Repository<Email>,
      { getBlockedSenders } as unknown as BlockedSendersService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("lists each mailing list with its volume and the method that would be used", async () => {
    const lists = await service.listMailingLists(USER_ID, NOW);

    expect(lists).toEqual([
      {
        emailId: "email-1",
        name: "Paragon",
        address: "news@paragon.test",
        emailCount: 12,
        triageThreadCount: 4,
        lastReceivedAt: new Date(NOW.getTime() - DAY).toISOString(),
        perWeek: 3,
        method: UNSUBSCRIBE_METHODS.ONE_CLICK,
      },
    ]);
  });

  it("only looks back over the window, scoped to the user and capped", async () => {
    await service.listMailingLists(USER_ID, NOW);

    expect(query.mock.calls[0][1]).toEqual([
      USER_ID,
      new Date(NOW.getTime() - UNSUBSCRIBE.MAILING_LIST_WINDOW_DAYS * DAY),
      UNSUBSCRIBE.MAX_MAILING_LISTS,
    ]);
  });

  it("reports the mailto method when there is no one-click URL", async () => {
    query.mockResolvedValue([
      row({ unsubscribeOptions: JSON.stringify(MAILTO_ONLY) }),
    ]);

    const [list] = await service.listMailingLists(USER_ID, NOW);

    expect(list.method).toBe(UNSUBSCRIBE_METHODS.MAILTO);
  });

  it("leaves out senders that are already blocked", async () => {
    query.mockResolvedValue([
      row(),
      row({ emailId: "email-2", from: "Promo <deals@shop.test>" }),
    ]);
    getBlockedSenders.mockResolvedValue([{ email: "NEWS@paragon.test" }]);

    const lists = await service.listMailingLists(USER_ID, NOW);

    expect(lists.map((list) => list.address)).toEqual(["deals@shop.test"]);
  });

  it("skips rows whose sender or unsubscribe info can't be read", async () => {
    query.mockResolvedValue([
      row({ from: null }),
      row({ emailId: "email-2", unsubscribeOptions: "not json" }),
      row({ emailId: "email-3", unsubscribeOptions: JSON.stringify({}) }),
    ]);

    expect(await service.listMailingLists(USER_ID, NOW)).toEqual([]);
  });
});

describe("emailsPerWeek", () => {
  it("averages over the weeks since the first email", () => {
    expect(emailsPerWeek(12, new Date(NOW.getTime() - 28 * DAY), NOW)).toBe(3);
  });

  it("counts at least one week, so a burst isn't inflated", () => {
    expect(emailsPerWeek(5, new Date(NOW.getTime() - 2 * DAY), NOW)).toBe(5);
  });

  it("keeps one decimal", () => {
    expect(emailsPerWeek(10, new Date(NOW.getTime() - 90 * DAY), NOW)).toBe(
      0.8,
    );
  });
});

describe("senderAddressOf", () => {
  it.each([
    ["news@paragon.test", "news@paragon.test"],
    ["Paragon <News@Paragon.test>", "news@paragon.test"],
    ["  deals@shop.test ", "deals@shop.test"],
  ])("reads %p as %p", (from, address) => {
    expect(senderAddressOf(from)).toBe(address);
  });
});
