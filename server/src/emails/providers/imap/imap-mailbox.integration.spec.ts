/**
 * Runs the IMAP mailbox operations against a real (in-process) IMAP server,
 * laid out like a cPanel / Crazy Domains mailbox: folders under "INBOX." and
 * no Archive folder until we create one.
 */
import hoodiecrow from "hoodiecrow-imap";
import type { AddressInfo } from "net";

import {
  archiveMailboxPathFor,
  detectSpecialMailboxes,
  type ImapServerSettings,
  INBOX_MAILBOX,
  withImapSession,
} from "../../../imap-accounts/imap-session";
import {
  appendSentMessage,
  downloadMessageSource,
  fetchMessages,
  findMessageIdsPresent,
  FLAGGED_FLAG,
  listInboxSnapshot,
  moveMessages,
  searchMailbox,
  setMessageFlag,
} from "./imap-mailbox";
import { translateSearchQuery } from "./imap-search-query";

const USER = "friend@crazy.test";
const PASSWORD = "correct-horse";
const HOST = "127.0.0.1";
const DAY_MS = 24 * 3600 * 1000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * An IMAP INTERNALDATE string (RFC 3501). A Date built in a Jest spec lives
 * in Jest's VM realm, so the server's structuredClone wouldn't see a Date.
 */
function daysAgo(days: number): string {
  const date = new Date(Date.now() - days * DAY_MS);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const time = date.toISOString().slice(11, 19);
  return `${day}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()} ${time} +0000`;
}

function rawMessage(headers: string[], body: string): string {
  return [...headers, "", body].join("\r\n");
}

const STORAGE = {
  INBOX: {
    messages: [
      {
        raw: rawMessage(
          [
            "Message-ID: <root@crazy.test>",
            "From: Friend <friend@crazy.test>",
            "Subject: Kitchen quote",
          ],
          "Can you send the quote?",
        ),
        flags: ["\\Seen"],
        internaldate: daysAgo(2),
      },
      {
        raw: rawMessage(
          [
            "Message-ID: <reply@colleague.test>",
            "In-Reply-To: <root@crazy.test>",
            "References: <root@crazy.test>",
            "From: Colleague <colleague@colleague.test>",
            "Subject: Re: Kitchen quote",
          ],
          "New total is $14,200.",
        ),
        flags: ["\\Flagged"],
        internaldate: daysAgo(1),
      },
      {
        raw: rawMessage(["From: noreply@shop.test", "Subject: No id"], "x"),
        flags: [],
        internaldate: daysAgo(1),
      },
    ],
  },
  "INBOX.": {
    separator: ".",
    folders: { Sent: { "special-use": "\\Sent" }, Trash: {} },
  },
};

describe("IMAP mailbox operations (in-process IMAP server)", () => {
  let server: ReturnType<typeof hoodiecrow>;
  let settings: ImapServerSettings;
  const session = { allowPrivateHosts: true };

  beforeEach(async () => {
    server = hoodiecrow({
      users: { [USER]: { password: PASSWORD } },
      plugins: ["SPECIAL-USE", "MOVE", "UIDPLUS", "ESEARCH", "ENABLE"],
      storage: STORAGE,
    });
    await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
    const { port } = server.address() as AddressInfo;
    settings = {
      host: HOST,
      port,
      secure: false,
      username: USER,
      password: PASSWORD,
    };
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("finds cPanel-style folders and nests a new Archive under INBOX", async () => {
    const result = await withImapSession(settings, session, async (client) => {
      const listed = await client.list();
      return {
        mailboxes: detectSpecialMailboxes(listed),
        archivePath: archiveMailboxPathFor(listed),
      };
    });
    expect(result.mailboxes).toEqual({
      archive: null,
      sent: "INBOX.Sent",
      trash: "INBOX.Trash",
    });
    expect(result.archivePath).toBe("INBOX.Archive");
  });

  it("lists, parses and threads inbox mail, synthesising missing Message-IDs", async () => {
    const messages = await withImapSession(
      settings,
      session,
      async (client) => {
        const snapshot = await listInboxSnapshot(client, {
          since: new Date(Date.now() - 7 * DAY_MS),
          limit: 50,
          host: HOST,
        });
        expect(snapshot.hitLimit).toBe(false);
        return fetchMessages(client, INBOX_MAILBOX, snapshot.entries);
      },
    );
    const byId = new Map(
      messages.map((message) => [message.messageId, message]),
    );
    expect(byId.get("reply@colleague.test")).toMatchObject({
      threadId: "root@crazy.test",
      isRead: false,
      starCount: 3,
    });
    expect(byId.get("root@crazy.test")).toMatchObject({ isRead: true });
    const synthetic = messages.find((message) => message.subject === "No id");
    expect(synthetic?.messageId).toMatch(/^imap\.\d+\.\d+@127\.0\.0\.1$/);
  });

  it("caps the snapshot at the newest messages", async () => {
    const snapshot = await withImapSession(settings, session, (client) =>
      listInboxSnapshot(client, {
        since: new Date(Date.now() - 7 * DAY_MS),
        limit: 2,
        host: HOST,
      }),
    );
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.hitLimit).toBe(true);
  });

  it("archives a thread by Message-ID and then sees it gone from INBOX", async () => {
    await withImapSession(settings, session, async (client) => {
      await client.mailboxCreate("INBOX.Archive");
      const moved = await moveMessages(client, {
        messageIds: ["root@crazy.test", "reply@colleague.test"],
        sources: [INBOX_MAILBOX],
        destination: "INBOX.Archive",
      });
      expect(moved).toBe(2);
      const stillInInbox = await findMessageIdsPresent(client, {
        mailbox: INBOX_MAILBOX,
        messageIds: ["root@crazy.test", "reply@colleague.test"],
        host: HOST,
      });
      expect([...stillInInbox]).toEqual([]);
      const inArchive = await findMessageIdsPresent(client, {
        mailbox: "INBOX.Archive",
        messageIds: ["root@crazy.test", "reply@colleague.test"],
        host: HOST,
      });
      expect([...inArchive].sort()).toEqual([
        "reply@colleague.test",
        "root@crazy.test",
      ]);
    });
  });

  it("clears and sets \\Flagged by Message-ID", async () => {
    const flagged = await withImapSession(settings, session, async (client) => {
      await setMessageFlag(client, {
        messageIds: ["reply@colleague.test"],
        mailboxes: [INBOX_MAILBOX],
        flag: FLAGGED_FLAG,
        enabled: false,
      });
      const snapshot = await listInboxSnapshot(client, {
        since: new Date(Date.now() - 7 * DAY_MS),
        limit: 50,
        host: HOST,
      });
      return snapshot.entries.find(
        (entry) => entry.messageId === "reply@colleague.test",
      )?.isFlagged;
    });
    expect(flagged).toBe(false);
  });

  it("files a sent copy and downloads it again by Message-ID", async () => {
    const raw = Buffer.from(
      rawMessage(
        [
          "Message-ID: <sent-1@crazy.test>",
          "From: friend@crazy.test",
          "Subject: Sent",
        ],
        "hello",
      ),
    );
    const downloaded = await withImapSession(
      settings,
      session,
      async (client) => {
        await appendSentMessage(client, "INBOX.Sent", raw);
        return downloadMessageSource(client, {
          messageId: "sent-1@crazy.test",
          mailboxes: [INBOX_MAILBOX, "INBOX.Sent"],
        });
      },
    );
    expect(downloaded?.toString()).toContain("Subject: Sent");
  });

  it("answers Gmail-style queries from the right folder", async () => {
    const results = await withImapSession(settings, session, (client) =>
      searchMailbox(client, {
        mailbox: INBOX_MAILBOX,
        criteria: translateSearchQuery("from:colleague@colleague.test")
          .criteria,
        limit: 10,
        host: HOST,
      }),
    );
    expect(results.map((message) => message.messageId)).toEqual([
      "reply@colleague.test",
    ]);
  });
});
