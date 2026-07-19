import {
  AppleMailMessageDetail,
  AppleMailMessageSummary,
} from "../../../apple-mail-accounts/apple-mail-script.service";
import {
  deriveThreadId,
  extractHeader,
  normalizeMessageId,
  parseAddress,
  parseAppleMailMessage,
} from "./apple-mail-message-parser";

function makeSummary(
  overrides: Partial<AppleMailMessageSummary> = {},
): AppleMailMessageSummary {
  return {
    appleId: 101,
    subject: "Quarterly report",
    sender: "Jane Doe <jane@example.com>",
    dateReceivedMs: 1750000000000,
    isRead: false,
    isFlagged: false,
    accountName: "Work",
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<AppleMailMessageDetail> = {},
): AppleMailMessageDetail {
  return {
    appleId: 101,
    messageId: "<abc123@mail.example.com>",
    content: "Hello there",
    allHeaders: "",
    attachments: [],
    ...overrides,
  };
}

describe("normalizeMessageId", () => {
  it("strips angle brackets and whitespace", () => {
    expect(normalizeMessageId("<id@host>")).toBe("id@host");
    expect(normalizeMessageId("  id@host ")).toBe("id@host");
    expect(normalizeMessageId("")).toBe("");
  });
});

describe("parseAddress", () => {
  it("parses display-name addresses", () => {
    expect(parseAddress("Jane Doe <jane@example.com>")).toEqual({
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("parses quoted display names", () => {
    expect(parseAddress('"Doe, Jane" <jane@example.com>')).toEqual({
      email: "jane@example.com",
      name: "Doe, Jane",
    });
  });

  it("parses bare addresses", () => {
    expect(parseAddress("jane@example.com")).toEqual({
      email: "jane@example.com",
    });
  });
});

describe("extractHeader", () => {
  const headers = [
    "Received: from smtp.example.com",
    "To: alpha@example.com,",
    "\tbeta@example.com",
    "Subject: Hi",
    "References: <root@host>",
    " <mid@host>",
    "In-Reply-To: <mid@host>",
  ].join("\r\n");

  it("finds a simple header case-insensitively", () => {
    expect(extractHeader(headers, "subject")).toBe("Hi");
  });

  it("unfolds continuation lines", () => {
    expect(extractHeader(headers, "To")).toBe(
      "alpha@example.com, beta@example.com",
    );
    expect(extractHeader(headers, "References")).toBe("<root@host> <mid@host>");
  });

  it("returns null when the header is missing", () => {
    expect(extractHeader(headers, "Cc")).toBeNull();
    expect(extractHeader("", "To")).toBeNull();
  });
});

describe("deriveThreadId", () => {
  it("uses the first References entry as the thread root", () => {
    const headers =
      "References: <root@host>\r\n <mid@host>\r\nIn-Reply-To: <mid@host>";
    expect(deriveThreadId(headers, "leaf@host")).toBe("root@host");
  });

  it("falls back to In-Reply-To when References is absent", () => {
    const headers = "In-Reply-To: <parent@host>";
    expect(deriveThreadId(headers, "leaf@host")).toBe("parent@host");
  });

  it("uses the message's own ID when no threading headers exist", () => {
    expect(deriveThreadId("Subject: Hi", "<leaf@host>")).toBe("leaf@host");
  });
});

describe("parseAppleMailMessage", () => {
  it("maps summary + detail into a RawEmailMessage", () => {
    const raw = parseAppleMailMessage(
      makeSummary({ isFlagged: true, isRead: true }),
      makeDetail({
        allHeaders:
          "To: team@example.com\r\nCc: boss@example.com\r\nReferences: <root@host>",
        attachments: [
          {
            id: "att-1",
            name: "report.pdf",
            mimeType: "application/pdf",
            fileSize: 2048,
            downloaded: true,
          },
        ],
      }),
    );

    expect(raw).toEqual({
      messageId: "abc123@mail.example.com",
      threadId: "root@host",
      subject: "Quarterly report",
      from: "jane@example.com",
      fromName: "Jane Doe",
      to: "team@example.com",
      cc: "boss@example.com",
      replyTo: undefined,
      body: "Hello there",
      starCount: 3,
      receivedAt: new Date(1750000000000),
      isRead: true,
      attachments: [
        {
          attachmentId: "att-1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 2048,
        },
      ],
    });
  });

  it("threads a message with no References under its own ID", () => {
    const raw = parseAppleMailMessage(makeSummary(), makeDetail());
    expect(raw?.threadId).toBe("abc123@mail.example.com");
    expect(raw?.starCount).toBe(0);
    expect(raw?.attachments).toBeUndefined();
  });

  it("falls back to the Message-Id header when the JXA property is empty", () => {
    const raw = parseAppleMailMessage(
      makeSummary(),
      makeDetail({
        messageId: "",
        allHeaders: "Message-Id: <from-header@host>\r\nTo: a@b.c",
      }),
    );
    expect(raw?.messageId).toBe("from-header@host");
  });

  it("skips nameless attachments and returns null without a message ID", () => {
    const raw = parseAppleMailMessage(
      makeSummary(),
      makeDetail({
        attachments: [
          { id: "x", name: "", mimeType: "", fileSize: 0, downloaded: false },
        ],
      }),
    );
    expect(raw?.attachments).toBeUndefined();

    expect(
      parseAppleMailMessage(makeSummary(), makeDetail({ messageId: "" })),
    ).toBeNull();
  });
});
