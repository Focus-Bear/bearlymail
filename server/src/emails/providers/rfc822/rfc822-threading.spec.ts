import {
  buildReplyReferences,
  deriveThreadIdFromChain,
  extractMessageIdTokens,
  formatMessageIdHeader,
  normalizeMessageId,
} from "./rfc822-threading";

describe("rfc822 threading", () => {
  it("normalises message IDs with or without brackets", () => {
    expect(normalizeMessageId("<a@b>")).toBe("a@b");
    expect(normalizeMessageId(" a@b ")).toBe("a@b");
  });

  it("extracts every bracketed id from a References header", () => {
    expect(extractMessageIdTokens("<root@x> <mid@y>\r\n <leaf@z>")).toEqual([
      "root@x",
      "mid@y",
      "leaf@z",
    ]);
    expect(extractMessageIdTokens(undefined)).toEqual([]);
  });

  it("roots a thread at the first References entry, then In-Reply-To, then itself", () => {
    expect(
      deriveThreadIdFromChain({
        references: ["root@x", "mid@y"],
        inReplyTo: ["mid@y"],
        messageId: "leaf@z",
      }),
    ).toBe("root@x");
    expect(
      deriveThreadIdFromChain({
        references: [],
        inReplyTo: ["parent@x"],
        messageId: "leaf@z",
      }),
    ).toBe("parent@x");
    expect(
      deriveThreadIdFromChain({
        references: [],
        inReplyTo: [],
        messageId: "<solo@x>",
      }),
    ).toBe("solo@x");
  });

  it("builds reply References that keep the root first and end with the parent", () => {
    const references = buildReplyReferences(["root@x"], "<parent@y>");
    expect(references).toEqual(["root@x", "parent@y"]);
    expect(
      deriveThreadIdFromChain({
        references,
        inReplyTo: ["parent@y"],
        messageId: "reply@z",
      }),
    ).toBe("root@x");
  });

  it("does not repeat the parent when it is already in the chain", () => {
    expect(buildReplyReferences(["root@x"], "root@x")).toEqual(["root@x"]);
  });

  it("formats ids for a header", () => {
    expect(formatMessageIdHeader(["a@b", "<c@d>"])).toBe("<a@b> <c@d>");
  });
});
