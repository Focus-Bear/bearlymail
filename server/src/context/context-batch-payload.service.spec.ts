import { GMAIL_LABELS } from "../constants/email-labels";
import { ContextBatchPayloadService } from "./context-batch-payload.service";
import type { ThreadData } from "./context-gmail-data.service";

const email = (
  from: string,
  receivedAt: string,
  overrides: Partial<ThreadData["emails"][number]> = {},
): ThreadData["emails"][number] => ({
  id: `${from}-${receivedAt}`,
  from,
  subject: "Subject",
  body: "Hello   there, this is\tthe body.",
  receivedAt: new Date(receivedAt),
  isRead: true,
  ...overrides,
});

const thread = (id: string, emails: ThreadData["emails"]): ThreadData => ({
  id,
  emails,
  updatedAt: new Date(),
  starCount: 0,
  isArchived: false,
});

describe("ContextBatchPayloadService (discovery stubs)", () => {
  const service = new ContextBatchPayloadService();
  const userEmail = "me@example.com";

  it("represents a thread by its first message from someone else", () => {
    const stub = service.buildDiscoveryStub(
      thread("t1", [
        email("other@example.com", "2026-09-01T10:00:00Z", {
          fromName: "Other Person",
        }),
        email(userEmail, "2026-09-01T11:00:00Z"),
      ]),
      userEmail,
    );
    expect(stub).toMatchObject({
      threadId: "t1",
      from: "other@example.com",
      fromName: "Other Person",
      userReplied: true,
    });
    expect(stub?.snippet).toBe("Hello there, this is the body.");
  });

  it("skips threads that only contain the user's own messages", () => {
    expect(
      service.buildDiscoveryStub(
        thread("t2", [email(userEmail, "2026-09-01T10:00:00Z")]),
        userEmail,
      ),
    ).toBeNull();
    expect(
      service.buildDiscoveryStub(
        thread("t3", [
          email("x@example.com", "2026-09-01T10:00:00Z", {
            labelIds: [GMAIL_LABELS.SENT],
          }),
        ]),
        null,
      ),
    ).toBeNull();
  });

  it("flags userReplied=false when the user never wrote in the thread", () => {
    const stub = service.buildDiscoveryStub(
      thread("t4", [email("news@example.com", "2026-09-01T10:00:00Z")]),
      userEmail,
    );
    expect(stub?.userReplied).toBe(false);
  });

  it("splits stubs into batches of the requested size", () => {
    const threads = Array.from({ length: 45 }, (_, index) =>
      thread(`t${index}`, [
        email(`sender${index}@example.com`, "2026-09-01T10:00:00Z"),
      ]),
    );
    const batches = service.buildDiscoveryBatches(threads, userEmail, 20);
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
  });
});
