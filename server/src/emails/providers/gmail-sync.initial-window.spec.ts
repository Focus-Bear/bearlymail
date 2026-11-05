import type { gmail_v1 } from "googleapis";
import type { PgBoss } from "pg-boss";

import { QUERY_LIMITS } from "../../constants/query-limits";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import { GmailProvider } from "./gmail.provider";
import { GmailSyncService } from "./gmail-sync.service";

const USER_ID = "user-123";
const GMAIL = {} as gmail_v1.Gmail;
const INBOX_PREFIX = "in:inbox ";
const AFTER_FILTER = "after:";

describe("GmailSyncService.fetchGmailThreadIds — sync window", () => {
  let service: GmailSyncService;
  let listThreads: jest.SpyInstance;

  beforeEach(() => {
    const usersService = {
      findOneWithTokens: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, lastEmailSyncAt: null } as User),
    };
    service = new GmailSyncService(
      usersService as unknown as UsersService,
      {} as EmailsService,
      {} as ScanEmailService,
      {} as PgBoss,
      {} as SyncHistoryService,
      {} as GmailProvider,
    );
    listThreads = jest
      .spyOn(service, "fetchAllThreadsWithPagination")
      .mockResolvedValue({ threadIds: [], hasMore: false });
  });

  afterEach(() => jest.restoreAllMocks());

  function inboxCall(): [gmail_v1.Gmail, string, number] {
    const call = listThreads.mock.calls.find(
      ([, query]) =>
        (query as string).startsWith(INBOX_PREFIX) &&
        !(query as string).includes("is:starred"),
    );
    if (!call) throw new Error("inbox listing was not requested");
    return call as [gmail_v1.Gmail, string, number];
  }

  it("lists the most recent inbox threads with no date floor on the initial sync", async () => {
    await service.fetchGmailThreadIds({
      userId: USER_ID,
      gmail: GMAIL,
      syncWindowHours: undefined,
      noDateFilter: false,
      queries: [],
      isInitialSync: true,
    });

    const [, query, maxResults] = inboxCall();
    expect(query).not.toContain(AFTER_FILTER);
    expect(maxResults).toBe(QUERY_LIMITS.INITIAL_SYNC_MAX_EMAILS);
  });

  it("keeps later syncs inside the ongoing window", async () => {
    await service.fetchGmailThreadIds({
      userId: USER_ID,
      gmail: GMAIL,
      syncWindowHours: undefined,
      noDateFilter: true,
      queries: [],
      isInitialSync: false,
    });

    const [, query] = inboxCall();
    expect(query).toContain(AFTER_FILTER);
  });
});
