import type { ListResponse } from "imapflow";

import { archiveMailboxPathFor, detectSpecialMailboxes } from "./imap-session";

function mailbox(path: string, specialUse?: string): ListResponse {
  const delimiter = ".";
  const name = path.split(delimiter).pop() as string;
  return { path, name, delimiter, specialUse } as unknown as ListResponse;
}

describe("detectSpecialMailboxes", () => {
  it("prefers SPECIAL-USE flags", () => {
    expect(
      detectSpecialMailboxes([
        mailbox("INBOX"),
        mailbox("INBOX.Old"),
        mailbox("INBOX.Saved", "\\Archive"),
        mailbox("INBOX.Outbox", "\\Sent"),
        mailbox("INBOX.Bin", "\\Trash"),
      ]),
    ).toEqual({
      archive: "INBOX.Saved",
      sent: "INBOX.Outbox",
      trash: "INBOX.Bin",
    });
  });

  it("falls back to conventional names on servers without SPECIAL-USE", () => {
    expect(
      detectSpecialMailboxes([
        mailbox("INBOX"),
        mailbox("INBOX.Sent Items"),
        mailbox("INBOX.Deleted Items"),
      ]),
    ).toEqual({
      archive: null,
      sent: "INBOX.Sent Items",
      trash: "INBOX.Deleted Items",
    });
  });
});

describe("archiveMailboxPathFor", () => {
  it("nests under INBOX on cPanel-style servers", () => {
    expect(
      archiveMailboxPathFor([mailbox("INBOX"), mailbox("INBOX.Sent")]),
    ).toBe("INBOX.Archive");
  });

  it("creates a top-level folder elsewhere", () => {
    expect(
      archiveMailboxPathFor([
        mailbox("INBOX"),
        mailbox("Sent"),
        mailbox("Trash"),
      ]),
    ).toBe("Archive");
  });
});
