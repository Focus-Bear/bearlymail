import type { ImapFlow } from "imapflow";
import type { PgBoss } from "pg-boss";

import type { ImapAccount } from "../../../database/entities/imap-account.entity";
import type { UsersService } from "../../../users/users.service";
import type { EmailCrudService } from "../../email-crud.service";
import type { EmailsService } from "../../emails.service";
import type { ScanEmailService } from "../../scan-email.service";
import {
  fetchMessages,
  findMessageIdsPresent,
  listInboxSnapshot,
} from "./imap-mailbox";
import { ImapSyncService } from "./imap-sync.service";

jest.mock("./imap-mailbox", () => ({
  fetchMessages: jest.fn(),
  findMessageIdsPresent: jest.fn(),
  listInboxSnapshot: jest.fn(),
}));

const ACCOUNT = {
  userId: "user-1",
  imapHost: "mail.crazy.test",
} as ImapAccount;
const CLIENT = {} as ImapFlow;

describe("ImapSyncService.syncInbox", () => {
  let emails: jest.Mocked<EmailsService>;
  let crud: jest.Mocked<EmailCrudService>;
  let users: jest.Mocked<UsersService>;
  let service: ImapSyncService;

  beforeEach(() => {
    emails = {
      updateEmail: jest.fn(),
      createEmail: jest.fn(),
      batchUpdateThreadStarCount: jest.fn(),
      batchUpdateThreadArchivedStatuses: jest.fn(),
      getNonArchivedThreadsNeedingCheck: jest.fn().mockResolvedValue([]),
      getThreadEmails: jest.fn(),
      updateThreadsLastCheckedAt: jest.fn(),
    } as unknown as jest.Mocked<EmailsService>;
    crud = {
      getReadStatesByMessageIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<EmailCrudService>;
    users = {
      markSyncWindowLimited: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    service = new ImapSyncService(
      users,
      emails,
      crud,
      {} as ScanEmailService,
      {} as PgBoss,
    );
    (listInboxSnapshot as jest.Mock).mockResolvedValue({
      entries: [],
      hitLimit: false,
    });
    (fetchMessages as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  it("mirrors read state for known mail and only downloads new messages", async () => {
    (listInboxSnapshot as jest.Mock).mockResolvedValue({
      entries: [
        { uid: 1, messageId: "known@x", isRead: true, isFlagged: false },
        { uid: 2, messageId: "new@x", isRead: false, isFlagged: true },
      ],
      hitLimit: false,
    });
    crud.getReadStatesByMessageIds.mockResolvedValue(
      new Map([["known@x", { id: "email-1", isRead: false }]]),
    );
    (fetchMessages as jest.Mock).mockResolvedValue([
      { messageId: "new@x", threadId: "root@x", starCount: 3 },
    ]);

    await service.syncInbox(CLIENT, ACCOUNT, false);

    expect(emails.updateEmail).toHaveBeenCalledWith("user-1", "email-1", {
      isRead: true,
    });
    expect((fetchMessages as jest.Mock).mock.calls[0][2]).toEqual([
      expect.objectContaining({ messageId: "new@x" }),
    ]);
    expect(emails.createEmail).toHaveBeenCalledTimes(1);
    expect(emails.batchUpdateThreadStarCount).toHaveBeenCalledWith("user-1", [
      { threadId: "root@x", starCount: 3 },
    ]);
    expect(emails.batchUpdateThreadArchivedStatuses).toHaveBeenCalledWith(
      "user-1",
      [{ threadId: "root@x", isArchived: false }],
    );
  });

  it("flags a truncated first sync so the UI can say older mail was skipped", async () => {
    (listInboxSnapshot as jest.Mock).mockResolvedValue({
      entries: [],
      hitLimit: true,
    });
    await service.syncInbox(CLIENT, ACCOUNT, true);
    expect(users.markSyncWindowLimited).toHaveBeenCalledWith("user-1");
  });

  it("archives IMAP threads that left INBOX elsewhere, and never judges other providers' threads", async () => {
    emails.getNonArchivedThreadsNeedingCheck.mockResolvedValue([
      "root@crazy.test",
      "still@crazy.test",
      "18c3a9f0b2e4d1aa",
    ]);
    emails.getThreadEmails.mockImplementation(
      async (_userId, threadId) => [{ messageId: threadId }] as never,
    );
    (findMessageIdsPresent as jest.Mock).mockResolvedValue(
      new Set(["still@crazy.test"]),
    );

    await service.syncInbox(CLIENT, ACCOUNT, false);

    expect(emails.getThreadEmails).not.toHaveBeenCalledWith(
      "user-1",
      "18c3a9f0b2e4d1aa",
    );
    expect(emails.batchUpdateThreadArchivedStatuses).toHaveBeenCalledWith(
      "user-1",
      [{ threadId: "root@crazy.test", isArchived: true }],
    );
    expect(emails.updateThreadsLastCheckedAt).toHaveBeenCalledWith("user-1", [
      "root@crazy.test",
      "still@crazy.test",
    ]);
  });
});
