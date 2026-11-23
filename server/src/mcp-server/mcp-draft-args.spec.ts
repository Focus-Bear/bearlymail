import { MCP_DRAFTS } from "../constants/mcp-server.constants";
import { addressListChange, parseDraftAttachments } from "./mcp-draft-args";
import { McpToolInputError } from "./mcp-tool-args";

const base64Of = (text: string) => Buffer.from(text).toString("base64");

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    filename: "invoice.pdf",
    mimeType: "application/pdf",
    contentBase64: base64Of("%PDF-1.4"),
    ...overrides,
  };
}

describe("parseDraftAttachments", () => {
  it("is undefined when absent and empty when cleared", () => {
    expect(parseDraftAttachments({})).toBeUndefined();
    expect(parseDraftAttachments({ attachments: [] })).toEqual([]);
  });

  it("keeps base64 content as the send queue stores it, ignoring line wraps", () => {
    const wrapped = `${base64Of("hello ")}\n${base64Of("world!")}`;
    expect(
      parseDraftAttachments({
        attachments: [attachment({ contentBase64: wrapped })],
      }),
    ).toEqual([
      {
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        content: wrapped.replace(/\s+/g, ""),
      },
    ]);
  });

  it.each([
    ["not base64", { contentBase64: "%%%not base64%%%" }],
    ["empty content", { contentBase64: "" }],
    ["a folder in the filename", { filename: "../etc/passwd" }],
    ["a control character in the filename", { filename: "a\u0000.pdf" }],
    ["a malformed MIME type", { mimeType: "pdf" }],
  ])("rejects %s", (_label, overrides) => {
    expect(() =>
      parseDraftAttachments({ attachments: [attachment(overrides)] }),
    ).toThrow(McpToolInputError);
  });

  it("rejects too many attachments", () => {
    const attachments = Array.from(
      { length: MCP_DRAFTS.MAX_ATTACHMENTS + 1 },
      () => attachment(),
    );
    expect(() => parseDraftAttachments({ attachments })).toThrow(
      new RegExp(`at most ${MCP_DRAFTS.MAX_ATTACHMENTS} attachments`),
    );
  });

  it("rejects attachments over the total size limit", () => {
    const halfLimit = Buffer.alloc(
      MCP_DRAFTS.MAX_ATTACHMENT_TOTAL_BYTES / 2 + 1,
    ).toString("base64");
    expect(() =>
      parseDraftAttachments({
        attachments: [
          attachment({ contentBase64: halfLimit }),
          attachment({ contentBase64: halfLimit }),
        ],
      }),
    ).toThrow(/at most 10 MB/);
  });

  it("rejects a non-array or a non-object entry", () => {
    expect(() => parseDraftAttachments({ attachments: "file" })).toThrow(
      McpToolInputError,
    );
    expect(() => parseDraftAttachments({ attachments: ["file"] })).toThrow(
      McpToolInputError,
    );
  });
});

describe("addressListChange", () => {
  it("leaves absent lists alone, clears empty ones and joins the rest", () => {
    expect(addressListChange({}, "cc")).toBeUndefined();
    expect(addressListChange({ cc: [] }, "cc")).toBeNull();
    expect(
      addressListChange({ cc: ["a@example.com", "b@example.com"] }, "cc"),
    ).toBe("a@example.com, b@example.com");
  });
});
