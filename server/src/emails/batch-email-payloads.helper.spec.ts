import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  buildBatchEmailPayloads,
  hasPriorityAnalysis,
  shouldBypassSummaryForPriority,
} from "./batch-email-payloads.helper";

describe("shouldBypassSummaryForPriority", () => {
  it("bypasses for QA keywords in the subject", () => {
    expect(
      shouldBypassSummaryForPriority("QA passed on issue #12", "all good"),
    ).toBe(true);
  });

  it("bypasses for cancellation keywords in the subject", () => {
    expect(
      shouldBypassSummaryForPriority(
        "StartSpace inductions cancelled",
        "Please note that we had to cancel inductions on the day.",
      ),
    ).toBe(true);
  });

  it("bypasses for reschedule/postpone keywords in the body", () => {
    expect(
      shouldBypassSummaryForPriority(
        "Tomorrow's workshop",
        "We need to reschedule the session to a later date.",
      ),
    ).toBe(true);
    expect(
      shouldBypassSummaryForPriority(
        "Team offsite",
        "The offsite has been postponed until further notice.",
      ),
    ).toBe(true);
  });

  it("does not bypass for ordinary emails", () => {
    expect(
      shouldBypassSummaryForPriority(
        "Weekly newsletter",
        "Here's what happened this week in the product.",
      ),
    ).toBe(false);
  });

  it("ignores keywords past the body scan window", () => {
    const longBody = `${"x".repeat(600)} cancelled`;
    expect(shouldBypassSummaryForPriority("Regular update", longBody)).toBe(
      false,
    );
  });
});

describe("buildBatchEmailPayloads", () => {
  const baseEmail = {
    id: "email-1",
    from: "amir@startspace.example",
    fromName: "Amir Aridi",
    subject: "StartSpace inductions cancelled",
    body: "We had to cancel inductions on Tue 14 July 2026 due to illness.",
    htmlBody: null,
    summary: "Amir informed you the induction was cancelled.",
    receivedAt: new Date("2026-07-13T22:44:00Z"),
    sentimentScore: 0,
  } as unknown as Email;

  it("uses the raw body (not the summary) for time-critical emails", () => {
    const [payload] = buildBatchEmailPayloads([baseEmail]);
    expect(payload.body).toContain("Tue 14 July 2026");
  });

  it("includes receivedAt in the payload", () => {
    const [payload] = buildBatchEmailPayloads([baseEmail]);
    expect(payload.receivedAt).toEqual(new Date("2026-07-13T22:44:00Z"));
  });

  it("prefers the summary for ordinary emails", () => {
    const ordinary = {
      ...baseEmail,
      subject: "Monthly update",
      body: "Here is the long monthly update body.",
      summary: "Short summary.",
    } as unknown as Email;
    const [payload] = buildBatchEmailPayloads([ordinary]);
    expect(payload.body).toBe("Short summary.");
  });

  describe("existing-analysis fields (gate batch triage)", () => {
    const EMAIL_THREAD_ID = "eth-1";
    const CATEGORY_ID = "cat-1";
    const CATEGORY_NAME = "Newsletters";
    const EXISTING_URGENCY = 42;
    const categoryMap = new Map([[CATEGORY_ID, CATEGORY_NAME]]);
    const emailInThread = {
      ...baseEmail,
      emailThreadId: EMAIL_THREAD_ID,
    } as unknown as Email;

    function makeThread(overrides: Partial<EmailThread>): EmailThread {
      // Entity column defaults for a freshly-synced, never-analysed thread.
      return {
        id: EMAIL_THREAD_ID,
        urgencyScore: 0,
        priorityScore: 0,
        priorityExplanation: null,
        prioritySource: null,
        categoryId: null,
        ...overrides,
      } as EmailThread;
    }

    function payloadFor(thread: EmailThread) {
      const [payload] = buildBatchEmailPayloads(
        [emailInThread],
        new Map([[EMAIL_THREAD_ID, thread]]),
        categoryMap,
      );
      return payload;
    }

    it("omits existing fields for a brand-new thread despite urgencyScore defaulting to 0", () => {
      const payload = payloadFor(makeThread({}));
      expect(payload.existingUrgencyScore).toBeUndefined();
      expect(payload.existingCategory).toBeUndefined();
    });

    it("omits existing fields when only a pre-sync category is set", () => {
      const payload = payloadFor(makeThread({ categoryId: CATEGORY_ID }));
      expect(payload.existingUrgencyScore).toBeUndefined();
      expect(payload.existingCategory).toBeUndefined();
    });

    it("omits existing fields for a persisted 'Calculating...' placeholder explanation", () => {
      const placeholder = {
        score: 0,
        dimensions: {},
        breakdown: [
          { factor: "Urgency", value: 0, description: "Calculating..." },
        ],
      } as unknown as EmailThread["priorityExplanation"];
      const payload = payloadFor(
        makeThread({ priorityExplanation: placeholder }),
      );
      expect(payload.existingUrgencyScore).toBeUndefined();
    });

    it("keeps existing fields for a thread scored by a priority writer", () => {
      const payload = payloadFor(
        makeThread({
          prioritySource: "llm",
          urgencyScore: EXISTING_URGENCY,
          categoryId: CATEGORY_ID,
        }),
      );
      expect(payload.existingUrgencyScore).toBe(EXISTING_URGENCY);
      expect(payload.existingCategory).toBe(CATEGORY_NAME);
    });

    it("keeps existing fields for a legacy/Lambda-scored thread with only calculatedAt", () => {
      const scoredExplanation = {
        score: EXISTING_URGENCY,
        breakdown: [],
        calculatedAt: "2026-10-01T00:00:00.000Z",
      } as unknown as EmailThread["priorityExplanation"];
      const payload = payloadFor(
        makeThread({
          priorityExplanation: scoredExplanation,
          urgencyScore: EXISTING_URGENCY,
        }),
      );
      expect(payload.existingUrgencyScore).toBe(EXISTING_URGENCY);
    });
  });
});

describe("hasPriorityAnalysis", () => {
  it("is false without a thread", () => {
    expect(hasPriorityAnalysis(undefined)).toBe(false);
  });
});
