import { Email } from "../database/entities/email.entity";
import {
  buildLocalModelInput,
  isReceived,
  senderDomainPattern,
  senderHash,
} from "./local-model-input";

describe("local-model input builder", () => {
  describe("senderDomainPattern", () => {
    it("matches the export's .*@domain$ form for bare and display addresses", () => {
      expect(senderDomainPattern("user@example.com")).toBe(".*@example\\.com$");
      expect(senderDomainPattern("Alice <alice@sub.domain.io>")).toBe(
        ".*@sub\\.domain\\.io$",
      );
    });
    it("returns empty for missing/invalid", () => {
      expect(senderDomainPattern(null)).toBe("");
      expect(senderDomainPattern("notanemail")).toBe("");
    });
  });

  describe("senderHash", () => {
    it("is a stable sha256 of the lowercased address", () => {
      expect(senderHash("ALICE@Example.com")).toBe(
        senderHash("alice@example.com"),
      );
      expect(senderHash("alice@example.com")).toMatch(/^[0-9a-f]{64}$/);
    });
    it("returns null when no address", () => {
      expect(senderHash("nope")).toBeNull();
    });
  });

  describe("isReceived", () => {
    it("is false only when SENT is present", () => {
      expect(isReceived(["INBOX"])).toBe(true);
      expect(isReceived(null)).toBe(true);
      expect(isReceived(["SENT", "INBOX"])).toBe(false);
    });
  });

  it("builds the full payload from an email", () => {
    const email = {
      threadId: "gmail-t1",
      subject: "Hi",
      body: "There",
      from: "Bob <bob@vendor.com>",
      isRead: true,
      labels: ["INBOX"],
      attachments: [
        { attachmentId: "a", filename: "f", mimeType: "x", size: 1 },
      ],
      receivedAt: new Date("2026-06-13T05:00:00.000Z"),
    } as unknown as Email;

    expect(buildLocalModelInput(email, 3)).toEqual({
      threadId: "gmail-t1",
      subject: "Hi",
      body: "There",
      senderDomain: ".*@vendor\\.com$",
      senderHash: senderHash("bob@vendor.com"),
      isReceived: true,
      isRead: true,
      hasAttachments: true,
      receivedAt: "2026-06-13T05:00:00.000Z",
      threadLength: 3,
    });
  });
});
