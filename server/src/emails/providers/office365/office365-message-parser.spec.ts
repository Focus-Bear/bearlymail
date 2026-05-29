import {
  extractAttachmentsFromGraphAttachments,
  normalizeContentId,
  parseOffice365Message,
} from "./office365-message-parser";

describe("parseOffice365Message", () => {
  const baseMessage = {
    id: "msg-001",
    conversationId: "conv-001",
    subject: "Test Subject",
    from: { emailAddress: { address: "alice@example.com", name: "Alice" } },
    receivedDateTime: "2024-01-15T10:00:00Z",
    isRead: false,
    body: { contentType: "text", content: "Hello world" },
    importance: "normal" as const,
  };

  it("should return null when id is missing", () => {
    expect(parseOffice365Message({ ...baseMessage, id: "" })).toBeNull();
  });

  it("should parse basic message fields", () => {
    const result = parseOffice365Message(baseMessage);
    expect(result).not.toBeNull();
    expect(result!.messageId).toBe("msg-001");
    expect(result!.threadId).toBe("conv-001");
    expect(result!.subject).toBe("Test Subject");
    expect(result!.from).toBe("alice@example.com");
    expect(result!.fromName).toBe("Alice");
  });

  it("should extract to and cc from toRecipients and ccRecipients", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      toRecipients: [
        { emailAddress: { address: "bob@example.com", name: "Bob" } },
        { emailAddress: { address: "carol@example.com", name: "Carol" } },
      ],
      ccRecipients: [
        { emailAddress: { address: "dave@example.com", name: "Dave" } },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.to).toBe("Bob <bob@example.com>, Carol <carol@example.com>");
    expect(result!.cc).toBe("Dave <dave@example.com>");
  });

  it("should handle recipients with address but no name", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      toRecipients: [{ emailAddress: { address: "noname@example.com" } }],
    });
    expect(result!.to).toBe("noname@example.com");
  });

  it("should return undefined to and cc when recipients are absent", () => {
    const result = parseOffice365Message(baseMessage);
    expect(result!.to).toBeUndefined();
    expect(result!.cc).toBeUndefined();
  });

  it("should return undefined to and cc when recipient arrays are empty", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      toRecipients: [],
      ccRecipients: [],
    });
    expect(result!.to).toBeUndefined();
    expect(result!.cc).toBeUndefined();
  });

  it("should skip recipients that have no address", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      toRecipients: [
        { emailAddress: { name: "No Address" } },
        { emailAddress: { address: "valid@example.com", name: "Valid" } },
      ],
    });
    expect(result!.to).toBe("Valid <valid@example.com>");
  });

  it("should map importance high to starCount 3", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      importance: "high",
    });
    expect(result!.starCount).toBe(3);
  });

  it("should map importance low to starCount 1", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      importance: "low",
    });
    expect(result!.starCount).toBe(1);
  });

  it("should map importance normal to starCount 0", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      importance: "normal",
    });
    expect(result!.starCount).toBe(0);
  });

  it("should include attachments when messageData.attachments is set", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      hasAttachments: true,
      attachments: [
        {
          id: "att-001",
          name: "report.pdf",
          contentType: "application/pdf",
          size: 12345,
          isInline: false,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    expect(result!.attachments).toHaveLength(1);
    expect(result!.attachments![0]).toMatchObject({
      attachmentId: "att-001",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 12345,
    });
    expect(result!.attachments![0].contentId).toBeUndefined();
  });

  it("should capture inline image contentId with angle brackets stripped", () => {
    const result = parseOffice365Message({
      ...baseMessage,
      hasAttachments: true,
      attachments: [
        {
          id: "att-002",
          name: "image001.png",
          contentType: "image/png",
          size: 4096,
          isInline: true,
          contentId: "<image001.png@01DA1234.5678ABCD>",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    expect(result!.attachments).toHaveLength(1);
    expect(result!.attachments![0].contentId).toBe(
      "image001.png@01DA1234.5678ABCD",
    );
  });

  it("should return undefined attachments when messageData.attachments is absent", () => {
    const result = parseOffice365Message(baseMessage);
    expect(result!.attachments).toBeUndefined();
  });
});

describe("extractAttachmentsFromGraphAttachments", () => {
  it("should return undefined for an empty array", () => {
    expect(extractAttachmentsFromGraphAttachments([])).toBeUndefined();
  });

  it("should map a regular file attachment", () => {
    const result = extractAttachmentsFromGraphAttachments([
      {
        id: "att-001",
        name: "document.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 8192,
        isInline: false,
        "@odata.type": "#microsoft.graph.fileAttachment",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({
      attachmentId: "att-001",
      filename: "document.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 8192,
    });
    expect(result![0].contentId).toBeUndefined();
  });

  it("should capture contentId for inline images and strip angle brackets", () => {
    const result = extractAttachmentsFromGraphAttachments([
      {
        id: "att-img",
        name: "logo.png",
        contentType: "image/png",
        size: 2048,
        isInline: true,
        contentId: "<logo.png@company.com>",
        "@odata.type": "#microsoft.graph.fileAttachment",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result![0].contentId).toBe("logo.png@company.com");
  });

  it("should skip non-fileAttachment odata types", () => {
    const result = extractAttachmentsFromGraphAttachments([
      {
        id: "ref-001",
        name: "shared-link",
        "@odata.type": "#microsoft.graph.referenceAttachment",
      },
    ]);
    expect(result).toBeUndefined();
  });
});

describe("normalizeContentId", () => {
  it("should strip leading and trailing angle brackets", () => {
    expect(normalizeContentId("<image001.png@01DA>")).toBe("image001.png@01DA");
  });

  it("should leave a value without angle brackets unchanged", () => {
    expect(normalizeContentId("image001.png@01DA")).toBe("image001.png@01DA");
  });
});
