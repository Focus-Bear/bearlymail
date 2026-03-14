import { parseOffice365Message } from "./office365-message-parser";

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
});
