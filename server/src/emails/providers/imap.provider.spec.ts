import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import type { ImapAccount } from "../../database/entities/imap-account.entity";
import type { ImapAccountsService } from "../../imap-accounts/imap-accounts.service";
import { withImapSession } from "../../imap-accounts/imap-session";
import {
  composeMessage,
  sendComposedMessage,
} from "../../imap-accounts/smtp-sender";
import type { UsersService } from "../../users/users.service";
import type { EmailsService } from "../emails.service";
import { ImapProvider } from "./imap.provider";
import {
  appendSentMessage,
  downloadMessageSource,
  moveMessages,
  searchMailbox,
} from "./imap/imap-mailbox";
import { attachmentIdFor } from "./imap/imap-message-parser";
import type { ImapSyncService } from "./imap/imap-sync.service";

jest.mock("../../imap-accounts/imap-session", () => ({
  ...jest.requireActual("../../imap-accounts/imap-session"),
  withImapSession: jest.fn(),
}));
jest.mock("../../imap-accounts/smtp-sender", () => ({
  composeMessage: jest.fn(),
  sendComposedMessage: jest.fn(),
}));
jest.mock("./imap/imap-mailbox", () => ({
  ...jest.requireActual("./imap/imap-mailbox"),
  appendSentMessage: jest.fn(),
  downloadMessageSource: jest.fn(),
  moveMessages: jest.fn(),
  searchMailbox: jest.fn(),
  setMessageFlag: jest.fn(),
}));

const ACCOUNT = {
  id: "acc-1",
  userId: "user-1",
  email: "friend@crazy.test",
  name: "Friend",
  imapHost: "mail.crazy.test",
  archiveMailbox: "INBOX.Archive",
  sentMailbox: "INBOX.Sent",
  trashMailbox: "INBOX.Trash",
  lastError: null,
  needsRelogin: false,
} as ImapAccount;

describe("ImapProvider", () => {
  let accounts: jest.Mocked<ImapAccountsService>;
  let emails: jest.Mocked<EmailsService>;
  let users: jest.Mocked<UsersService>;
  let sync: jest.Mocked<ImapSyncService>;
  let provider: ImapProvider;

  beforeEach(() => {
    accounts = {
      findPrimary: jest.fn().mockResolvedValue(ACCOUNT),
      hasConnectedImap: jest.fn(),
      recordSyncOutcome: jest.fn(),
      sessionOptions: { allowPrivateHosts: false },
    } as unknown as jest.Mocked<ImapAccountsService>;
    emails = {
      getThreadEmails: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailsService>;
    users = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: "user-1", lastEmailSyncAt: null }),
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    sync = {
      syncInbox: jest.fn(),
      scanHistory: jest.fn(),
    } as unknown as jest.Mocked<ImapSyncService>;
    (withImapSession as jest.Mock).mockImplementation(async (_s, _o, work) =>
      work({} as ImapFlow),
    );
    (composeMessage as jest.Mock).mockResolvedValue({
      messageId: "new@crazy.test",
      raw: Buffer.from("raw"),
      recipients: ["billing@supplier.test"],
    });
    provider = new ImapProvider(users, emails, accounts, sync);
  });

  afterEach(() => jest.clearAllMocks());

  describe("syncEmails", () => {
    it("syncs the primary account and always advances lastEmailSyncAt", async () => {
      await provider.syncEmails("user-1");
      expect(sync.syncInbox).toHaveBeenCalledWith(
        expect.anything(),
        ACCOUNT,
        true,
      );
      expect(users.update).toHaveBeenCalledWith("user-1", {
        lastEmailSyncAt: expect.any(Date),
      });
    });

    it("flags the account for a new password when the server rejects it", async () => {
      (withImapSession as jest.Mock).mockRejectedValue(
        Object.assign(new Error("AUTHENTICATIONFAILED"), {
          authenticationFailed: true,
        }),
      );
      await expect(provider.syncEmails("user-1")).rejects.toThrow();
      expect(accounts.recordSyncOutcome).toHaveBeenCalledWith("acc-1", {
        error: "AUTHENTICATIONFAILED",
        needsRelogin: true,
      });
      expect(users.update).toHaveBeenCalled();
    });

    it("clears a previous error once a sync works again", async () => {
      accounts.findPrimary.mockResolvedValue({
        ...ACCOUNT,
        lastError: "timeout",
      } as ImapAccount);
      await provider.syncEmails("user-1");
      expect(accounts.recordSyncOutcome).toHaveBeenCalledWith("acc-1", {
        error: null,
        needsRelogin: false,
      });
    });
  });

  it("archives every message of a thread from INBOX into the Archive folder", async () => {
    emails.getThreadEmails.mockResolvedValue([
      { messageId: "root@crazy.test" },
      { messageId: "reply@colleague.test" },
    ] as never);
    (moveMessages as jest.Mock).mockResolvedValue(2);
    await provider.archiveThread("user-1", "root@crazy.test");
    expect(moveMessages).toHaveBeenCalledWith(expect.anything(), {
      messageIds: ["root@crazy.test", "reply@colleague.test"],
      sources: ["INBOX"],
      destination: "INBOX.Archive",
    });
  });

  it("replies in-thread and files the sent copy", async () => {
    emails.getThreadEmails.mockResolvedValue([
      { messageId: "reply@colleague.test" },
    ] as never);
    const result = await provider.sendReply("user-1", {
      threadId: "root@crazy.test",
      to: "Billing <billing@supplier.test>",
      subject: "Re: Quote",
      body: "Thanks!",
    });
    expect(composeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { email: "friend@crazy.test", name: "Friend" },
        to: ["Billing <billing@supplier.test>"],
        inReplyTo: "reply@colleague.test",
        references: ["root@crazy.test", "reply@colleague.test"],
      }),
    );
    expect(sendComposedMessage).toHaveBeenCalled();
    expect(appendSentMessage).toHaveBeenCalledWith(
      expect.anything(),
      "INBOX.Sent",
      Buffer.from("raw"),
    );
    expect(result).toEqual({
      messageId: "new@crazy.test",
      threadId: "root@crazy.test",
    });
  });

  it("still reports a sent message as sent when filing the copy fails", async () => {
    (appendSentMessage as jest.Mock).mockRejectedValue(new Error("quota"));
    await expect(
      provider.sendEmail("user-1", {
        to: [{ email: "a@b.test" }],
        subject: "Hi",
        body: "<p>Hi</p>",
      }),
    ).resolves.toEqual({
      messageId: "new@crazy.test",
      threadId: "new@crazy.test",
    });
    expect(composeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ html: "<p>Hi</p>", text: "" }),
    );
  });

  it("re-downloads a message to serve an attachment by its checksum id", async () => {
    const source = [
      "Message-ID: <invoice@supplier.test>",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain",
      "",
      "see attached",
      "--b",
      'Content-Type: text/csv; name="invoice.csv"',
      'Content-Disposition: attachment; filename="invoice.csv"',
      "",
      "item,amount",
      "--b--",
      "",
    ].join("\r\n");
    (downloadMessageSource as jest.Mock).mockResolvedValue(Buffer.from(source));
    const parsed = await simpleParser(source);
    const attachmentId = attachmentIdFor(parsed.attachments[0], 0);

    const attachment = await provider.getAttachment(
      "user-1",
      "invoice@supplier.test",
      attachmentId,
    );
    expect(attachment.filename).toBe("invoice.csv");
    expect(attachment.attachmentBuffer.toString()).toContain("item,amount");
    expect(downloadMessageSource).toHaveBeenCalledWith(expect.anything(), {
      messageId: "invoice@supplier.test",
      mailboxes: ["INBOX", "INBOX.Archive", "INBOX.Sent"],
    });
  });

  it("fetches threads it never synced (e.g. archived mail) from the server", async () => {
    (searchMailbox as jest.Mock).mockResolvedValue([
      { messageId: "old@crazy.test", receivedAt: new Date("2026-01-01") },
    ]);
    const messages = await provider.fetchThreadMessages(
      "user-1",
      "old@crazy.test",
    );
    // Found in all three folders, returned once.
    expect(messages).toHaveLength(1);
    expect((searchMailbox as jest.Mock).mock.calls[0][1].criteria).toEqual({
      or: [
        { header: { "message-id": "<old@crazy.test>" } },
        { header: { references: "<old@crazy.test>" } },
      ],
    });
  });

  it("serves synced threads from the local store without touching the server", async () => {
    emails.getThreadEmails.mockResolvedValue([
      {
        messageId: "a@b",
        threadId: "a@b",
        subject: "s",
        receivedAt: new Date(),
      },
    ] as never);
    await provider.fetchThreadMessages("user-1", "a@b");
    expect(withImapSession).not.toHaveBeenCalled();
  });
});
