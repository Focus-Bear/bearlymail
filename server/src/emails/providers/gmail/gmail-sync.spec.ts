import { gmail_v1 } from "googleapis";

import { isThreadStarred } from "./gmail-sync";

describe("gmail-sync helpers", () => {
  describe("isThreadStarred", () => {
    it("should return true if any message has STARRED label", () => {
      const messages: gmail_v1.Schema$Message[] = [
        { id: "msg1", labelIds: ["INBOX", "UNREAD"] },
        { id: "msg2", labelIds: ["INBOX", "STARRED"] },
        { id: "msg3", labelIds: ["INBOX"] },
      ];

      expect(isThreadStarred(messages)).toBe(true);
    });

    it("should return true if first message is starred but latest is not", () => {
      const messages: gmail_v1.Schema$Message[] = [
        { id: "msg1", labelIds: ["INBOX", "STARRED"] },
        { id: "msg2", labelIds: ["INBOX", "UNREAD"] },
        { id: "msg3", labelIds: ["INBOX"] },
      ];

      expect(isThreadStarred(messages)).toBe(true);
    });

    it("should return false if no messages have STARRED label", () => {
      const messages: gmail_v1.Schema$Message[] = [
        { id: "msg1", labelIds: ["INBOX", "UNREAD"] },
        { id: "msg2", labelIds: ["INBOX", "IMPORTANT"] },
        { id: "msg3", labelIds: ["INBOX"] },
      ];

      expect(isThreadStarred(messages)).toBe(false);
    });

    it("should return false for empty messages array", () => {
      expect(isThreadStarred([])).toBe(false);
    });

    it("should return false for undefined messages", () => {
      expect(isThreadStarred(undefined)).toBe(false);
    });

    it("should handle messages with undefined labelIds", () => {
      const messages: gmail_v1.Schema$Message[] = [
        { id: "msg1", labelIds: undefined },
        { id: "msg2", labelIds: ["STARRED"] },
      ];

      expect(isThreadStarred(messages)).toBe(true);
    });

    it("should handle all messages with undefined labelIds", () => {
      const messages: gmail_v1.Schema$Message[] = [
        { id: "msg1", labelIds: undefined },
        { id: "msg2", labelIds: undefined },
      ];

      expect(isThreadStarred(messages)).toBe(false);
    });
  });
});
