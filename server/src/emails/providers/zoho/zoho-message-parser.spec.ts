import { parseZohoMessage } from "./zoho-message-parser";

describe("parseZohoMessage", () => {
  const baseMessage = {
    uid: "zoho-001",
    threadId: "thread-001",
    subject: "Test Subject",
    from: { address: "alice@example.com", personal: "Alice" },
    receivedTime: 1705312800,
    isRead: false,
    content: { text: "Hello world", html: "<p>Hello world</p>" },
    importance: "normal" as const,
  };

  it("should return null when uid is missing", () => {
    expect(parseZohoMessage({ ...baseMessage, uid: undefined })).toBeNull();
  });

  it("should return null when threadId is missing", () => {
    expect(
      parseZohoMessage({ ...baseMessage, threadId: undefined }),
    ).toBeNull();
  });

  it("should parse basic message fields", () => {
    const result = parseZohoMessage(baseMessage);
    expect(result).not.toBeNull();
    expect(result!.messageId).toBe("zoho-001");
    expect(result!.threadId).toBe("thread-001");
    expect(result!.subject).toBe("Test Subject");
    expect(result!.from).toBe("alice@example.com");
    expect(result!.fromName).toBe("Alice");
  });

  it("should extract to from toAddress", () => {
    const result = parseZohoMessage({
      ...baseMessage,
      toAddress: "Bob <bob@example.com>, Carol <carol@example.com>",
    });
    expect(result).not.toBeNull();
    expect(result!.to).toBe("Bob <bob@example.com>, Carol <carol@example.com>");
  });

  it("should extract cc from ccAddress", () => {
    const result = parseZohoMessage({
      ...baseMessage,
      ccAddress: "Dave <dave@example.com>",
    });
    expect(result).not.toBeNull();
    expect(result!.cc).toBe("Dave <dave@example.com>");
  });

  it("should return undefined to and cc when addresses are absent", () => {
    const result = parseZohoMessage(baseMessage);
    expect(result!.to).toBeUndefined();
    expect(result!.cc).toBeUndefined();
  });

  it("should return undefined to and cc when addresses are empty strings", () => {
    const result = parseZohoMessage({
      ...baseMessage,
      toAddress: "",
      ccAddress: "",
    });
    expect(result!.to).toBeUndefined();
    expect(result!.cc).toBeUndefined();
  });

  it("should map importance high to starCount 3", () => {
    const result = parseZohoMessage({ ...baseMessage, importance: "high" });
    expect(result!.starCount).toBe(3);
  });

  it("should map importance low to starCount 1", () => {
    const result = parseZohoMessage({ ...baseMessage, importance: "low" });
    expect(result!.starCount).toBe(1);
  });
});
