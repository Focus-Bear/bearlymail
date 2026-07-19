import { Email } from "../database/entities/email.entity";
import {
  buildBatchEmailPayloads,
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
});
