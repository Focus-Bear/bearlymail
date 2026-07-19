import { gmail_v1 } from "googleapis";

import {
  isGmailAuthError,
  isThreadStarred,
  verifyThreadStatusesInGmail,
} from "./gmail-sync";

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

  describe("isGmailAuthError", () => {
    it("returns true for HTTP 401 on the top-level code", () => {
      expect(isGmailAuthError({ code: 401, message: "Unauthorized" })).toBe(
        true,
      );
    });

    it("returns true for HTTP 401 on the nested response", () => {
      expect(
        isGmailAuthError({
          message: "Invalid Credentials",
          response: { status: 401 },
        }),
      ).toBe(true);
    });

    it("returns true when the message contains invalid_grant", () => {
      expect(isGmailAuthError(new Error("invalid_grant: Bad Request"))).toBe(
        true,
      );
    });

    it("returns true for HTTP 403 with reason insufficientPermissions (top-level errors)", () => {
      // Shape of a real Gmail "Request had insufficient authentication scopes" error.
      const error = {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        errors: [
          {
            message: "Insufficient Permission",
            domain: "global",
            reason: "insufficientPermissions",
          },
        ],
      };
      expect(isGmailAuthError(error)).toBe(true);
    });

    it("returns true for HTTP 403 with reason insufficientPermissions (nested response data)", () => {
      const error = {
        message: "Request had insufficient authentication scopes.",
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              status: "PERMISSION_DENIED",
              errors: [{ reason: "insufficientPermissions" }],
            },
          },
        },
      };
      expect(isGmailAuthError(error)).toBe(true);
    });

    it("returns true for HTTP 403 with an insufficient_scope www-authenticate header", () => {
      const error = {
        code: 403,
        message: "Forbidden",
        response: {
          status: 403,
          headers: {
            "www-authenticate":
              'Bearer realm="https://accounts.google.com/", error="insufficient_scope", scope="https://www.googleapis.com/auth/gmail.modify"',
          },
        },
      };
      expect(isGmailAuthError(error)).toBe(true);
    });

    it("returns FALSE for a transient 403 userRateLimitExceeded", () => {
      const error = {
        code: 403,
        message: "User Rate Limit Exceeded",
        errors: [
          {
            message: "User Rate Limit Exceeded",
            domain: "usageLimits",
            reason: "userRateLimitExceeded",
          },
        ],
      };
      expect(isGmailAuthError(error)).toBe(false);
    });

    it("returns FALSE for a transient 403 rateLimitExceeded", () => {
      const error = {
        code: 403,
        message: "Rate Limit Exceeded",
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              errors: [{ reason: "rateLimitExceeded" }],
            },
          },
        },
      };
      expect(isGmailAuthError(error)).toBe(false);
    });

    it("returns FALSE for non-auth statuses such as 404", () => {
      expect(isGmailAuthError({ code: 404, message: "Not Found" })).toBe(false);
    });

    it("returns FALSE for unrelated errors", () => {
      expect(isGmailAuthError(new Error("Network timeout"))).toBe(false);
      expect(isGmailAuthError(null)).toBe(false);
      expect(isGmailAuthError(undefined)).toBe(false);
    });
  });

  /*
   * Regression tests for issue #857:
   *   The autoresponder sends a reply to a thread. That reply becomes the
   *   latest message and only carries the SENT label (not INBOX). The old
   *   code checked only the latest message, which falsely marked the thread
   *   as archived and hid it from all inbox views.
   *
   *   Fix: a thread is archived only when NO message in it has the INBOX label.
   *
   * These tests exercise verifyThreadStatusesInGmail via a mock Gmail client.
   */
  describe("verifyThreadStatusesInGmail — archive status (#857 regression)", () => {
    function makeGmailMock(
      threads: Record<string, gmail_v1.Schema$Thread>,
    ): gmail_v1.Gmail {
      return {
        users: {
          threads: {
            get: jest.fn(async ({ id }: { userId: string; id: string }) => ({
              data: threads[id] ?? { messages: [] },
            })),
          },
        },
      } as unknown as gmail_v1.Gmail;
    }

    it("should NOT archive a thread when original email is in INBOX and latest message is a SENT reply", async () => {
      /*
       * Scenario: user (or auto-responder) replied to an incoming email.
       * Original message: INBOX + UNREAD labels.
       * Reply (sent): SENT label only — no INBOX label.
       * Expected: thread is NOT archived because the original email is still
       * in the INBOX.
       */
      const gmail = makeGmailMock({
        "thread-abc": {
          messages: [
            { id: "msg1", labelIds: ["INBOX", "UNREAD"] },
            { id: "msg2", labelIds: ["SENT"] },
          ],
        },
      });

      const updates = await verifyThreadStatusesInGmail(
        "user-1",
        ["thread-abc"],
        gmail,
      );

      expect(updates).toHaveLength(1);
      expect(updates[0].isArchived).toBe(false);
    });

    it("should archive a thread when NO message has the INBOX label", async () => {
      /*
       * Scenario: the email was genuinely archived in Gmail — none of its
       * messages carry the INBOX label any more.
       */
      const gmail = makeGmailMock({
        "thread-def": {
          messages: [
            { id: "msg1", labelIds: ["All Mail"] },
            { id: "msg2", labelIds: ["SENT"] },
          ],
        },
      });

      const updates = await verifyThreadStatusesInGmail(
        "user-1",
        ["thread-def"],
        gmail,
      );

      expect(updates).toHaveLength(1);
      expect(updates[0].isArchived).toBe(true);
    });

    it("should NOT archive a thread when auto-responder sent reply and original email remains in INBOX", async () => {
      /*
       * The canonical #857 scenario:
       *   1. Email arrives in INBOX.
       *   2. Auto-responder sends reply (becomes latest message, labels: SENT).
       *   3. Gmail sync runs — must NOT mark thread as archived.
       */
      const gmail = makeGmailMock({
        "thread-autoresponder": {
          messages: [
            {
              id: "incoming",
              labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
            },
            { id: "autoresponse", labelIds: ["SENT"] },
          ],
        },
      });

      const updates = await verifyThreadStatusesInGmail(
        "user-1",
        ["thread-autoresponder"],
        gmail,
      );

      expect(updates[0].isArchived).toBe(false);
    });

    it("should keep thread archived if NO message has INBOX even after auto-responder sent reply", async () => {
      /*
       * Edge case: the thread was already manually archived (no INBOX label on
       * original messages) before the auto-responder replied. Should remain archived.
       */
      const gmail = makeGmailMock({
        "thread-pre-archived": {
          messages: [
            { id: "incoming", labelIds: ["All Mail"] },
            { id: "autoresponse", labelIds: ["SENT"] },
          ],
        },
      });

      const updates = await verifyThreadStatusesInGmail(
        "user-1",
        ["thread-pre-archived"],
        gmail,
      );

      expect(updates[0].isArchived).toBe(true);
    });

    it("should not affect star count calculation when checking archive status", async () => {
      const gmail = makeGmailMock({
        "thread-starred": {
          messages: [
            { id: "msg1", labelIds: ["INBOX", "STARRED"] },
            { id: "msg2", labelIds: ["SENT"] },
          ],
        },
      });

      const updates = await verifyThreadStatusesInGmail(
        "user-1",
        ["thread-starred"],
        gmail,
      );

      expect(updates[0].starCount).toBe(3);
      expect(updates[0].isArchived).toBe(false);
    });
  });
});
