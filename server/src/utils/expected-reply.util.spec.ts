import {
  followUpDaysFromHours,
  resolveExpectedReplyHours,
} from "./expected-reply.util";

// A Monday, so "next Monday" resolves a whole week out rather than same-day.
const NOW = new Date("2026-03-02T09:00:00Z");

describe("resolveExpectedReplyHours", () => {
  it("returns undefined when nothing was asked for", () => {
    expect(resolveExpectedReplyHours({}, NOW)).toBeUndefined();
  });

  it("parses a relative free-text duration into whole hours", () => {
    expect(
      resolveExpectedReplyHours({ expectedReplyDuration: "48h" }, NOW),
    ).toBe(48);
  });

  it("ignores a whitespace-only duration", () => {
    expect(
      resolveExpectedReplyHours({ expectedReplyDuration: "   " }, NOW),
    ).toBeUndefined();
  });

  it("parses natural language the same way snooze does", () => {
    const hours = resolveExpectedReplyHours(
      { expectedReplyDuration: "next Monday", locale: "en" },
      NOW,
    );

    expect(hours).toBeGreaterThan(0);
  });

  it("lets a free-text duration win over an explicit hours value", () => {
    expect(
      resolveExpectedReplyHours(
        { expectedReplyDuration: "48h", expectedReplyHours: 3 },
        NOW,
      ),
    ).toBe(48);
  });

  it("falls back to a numeric hours value", () => {
    expect(resolveExpectedReplyHours({ expectedReplyHours: 12 }, NOW)).toBe(12);
  });

  it("coerces the string hours the multipart path sends", () => {
    expect(resolveExpectedReplyHours({ expectedReplyHours: "24" }, NOW)).toBe(
      24,
    );
  });

  it("preserves an explicit zero, which means no follow-up", () => {
    expect(resolveExpectedReplyHours({ expectedReplyHours: 0 }, NOW)).toBe(0);
  });

  it("returns undefined rather than NaN for unparseable hours", () => {
    expect(
      resolveExpectedReplyHours({ expectedReplyHours: "soon" }, NOW),
    ).toBeUndefined();
  });
});

describe("followUpDaysFromHours", () => {
  it("rounds a sub-day window up to one day", () => {
    expect(followUpDaysFromHours(1)).toBe(1);
  });

  it("converts whole days exactly", () => {
    expect(followUpDaysFromHours(48)).toBe(2);
  });

  it("rounds a partial day up", () => {
    expect(followUpDaysFromHours(50)).toBe(3);
  });
});
