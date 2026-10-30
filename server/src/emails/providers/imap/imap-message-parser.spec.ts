import { simpleParser } from "mailparser";

import { STAR_COUNTS } from "../../../constants/priority-constants";
import { parseImapMessage } from "./imap-message-parser";

const REPLY = [
  "Message-ID: <reply@colleague.test>",
  "In-Reply-To: <root@crazy.test>",
  "References: <root@crazy.test>",
  "Date: Tue, 27 Oct 2026 09:00:00 +0000",
  "From: Colleague <colleague@colleague.test>",
  "To: Friend <friend@crazy.test>, other@crazy.test",
  "Cc: boss@crazy.test",
  "Subject: Re: Quote",
  "",
  "New total is $14,200.",
].join("\r\n");

const WITH_ATTACHMENT = [
  "Message-ID: <invoice@supplier.test>",
  "From: billing@supplier.test",
  "Subject: Invoice",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain",
  "",
  "Attached.",
  "--b1",
  'Content-Type: text/csv; name="invoice.csv"',
  'Content-Disposition: attachment; filename="invoice.csv"',
  "",
  "item,amount",
  "--b1--",
  "",
].join("\r\n");

describe("parseImapMessage", () => {
  it("maps headers, threading and IMAP state", async () => {
    const internalDate = new Date("2026-10-27T09:05:00Z");
    const raw = parseImapMessage(
      await simpleParser(REPLY),
      { isRead: true, isFlagged: true, internalDate },
      "fallback@host",
    );
    expect(raw).toMatchObject({
      messageId: "reply@colleague.test",
      threadId: "root@crazy.test",
      subject: "Re: Quote",
      from: "colleague@colleague.test",
      fromName: "Colleague",
      to: "Friend <friend@crazy.test>, other@crazy.test",
      cc: "boss@crazy.test",
      isRead: true,
      starCount: STAR_COUNTS.HIGH,
      receivedAt: internalDate,
    });
    expect(raw.body).toContain("$14,200");
  });

  it("uses the fallback id for messages without a Message-ID", async () => {
    const raw = parseImapMessage(
      await simpleParser("Subject: hi\r\n\r\nbody"),
      { isRead: false, isFlagged: false },
      "imap.7.42@mail.host",
    );
    expect(raw.messageId).toBe("imap.7.42@mail.host");
    expect(raw.threadId).toBe("imap.7.42@mail.host");
    expect(raw.starCount).toBe(STAR_COUNTS.NONE);
  });

  it("lists attachments with a stable content checksum id", async () => {
    const parsed = await simpleParser(WITH_ATTACHMENT);
    const first = parseImapMessage(
      parsed,
      { isRead: false, isFlagged: false },
      "x",
    );
    const again = parseImapMessage(
      await simpleParser(WITH_ATTACHMENT),
      { isRead: false, isFlagged: false },
      "x",
    );
    expect(first.attachments).toEqual([
      expect.objectContaining({
        filename: "invoice.csv",
        mimeType: "text/csv",
      }),
    ]);
    expect(first.attachments?.[0].attachmentId).toBe(
      again.attachments?.[0].attachmentId,
    );
  });
});
