/**
 * Unit tests for EmailInboxDecryptService's inbox summary derivation: the inbox
 * row must never be blank — when there's no stored summary (and one isn't being
 * generated), it falls back to a deterministic preview built from the body.
 *
 * EncryptionHelper.tryDecrypt is fail-open: on non-ciphertext input it returns
 * the input unchanged, so these tests pass plaintext directly.
 */
import { RawEmailRow } from "./email-inbox.types";
import { EmailInboxDecryptService } from "./email-inbox-decrypt.service";

function makeRow(overrides: Partial<RawEmailRow>): RawEmailRow {
  return {
    id: "email-1",
    userId: "user-1",
    threadId: "thread-1",
    emailThreadId: "thread-uuid",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Subject",
    summary: null,
    body: null,
    htmlBody: null,
    isProcessingSummary: false,
    isProcessingPriority: false,
    isRead: false,
    isSnoozed: false,
    snoozeUntil: null,
    isBatched: false,
    batchReleaseAt: null,
    wasDeliveredEarly: false,
    batchDecisionReason: null,
    receivedAt: new Date(0),
    starCount: 0,
    isArchived: false,
    urgencyScore: 0,
    ...overrides,
  } as unknown as RawEmailRow;
}

describe("EmailInboxDecryptService — inbox summary derivation", () => {
  const service = new EmailInboxDecryptService(null as never, null as never);

  it("returns the stored summary when present (no body fallback)", () => {
    const row = makeRow({
      summary: "Real LLM summary",
      body: "Body that should be ignored",
    });
    expect(service.decryptRawEmailRow(row).summary).toBe("Real LLM summary");
  });

  it("falls back to a deterministic body preview when summary is empty", () => {
    const row = makeRow({
      summary: null,
      body: "Quarterly newsletter: here are three cat facts you might enjoy.",
    });
    expect(service.decryptRawEmailRow(row).summary).toContain("cat facts");
  });

  it("does NOT fall back while a summary is still being generated", () => {
    const row = makeRow({
      summary: null,
      isProcessingSummary: true,
      body: "Body present but a summary is in flight.",
    });
    // Empty/null so the client shows its "Generating summary…" state, not a preview.
    expect(service.decryptRawEmailRow(row).summary).toBeFalsy();
  });

  it("stays blank when there is neither a summary nor a body", () => {
    const row = makeRow({ summary: null, body: null, htmlBody: null });
    expect(service.decryptRawEmailRow(row).summary).toBeFalsy();
  });
});
