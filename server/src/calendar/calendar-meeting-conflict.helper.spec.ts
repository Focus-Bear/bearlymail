import { MeetingDateReference } from "../llm/llm-tone.service";
import {
  AttendeeEvent,
  buildCalendarConflictWarning,
  eventLocalDate,
} from "./calendar-meeting-conflict.helper";

const TZ = "Australia/Melbourne";

function meetingRef(
  overrides: Partial<MeetingDateReference> = {},
): MeetingDateReference {
  return {
    phrase: "talking tomorrow",
    resolvedDate: "2026-07-23",
    isMeetingWithRecipient: true,
    ...overrides,
  };
}

function event(start: string): AttendeeEvent {
  return { start };
}

describe("eventLocalDate", () => {
  it("passes through all-day (date-only) starts unchanged", () => {
    expect(eventLocalDate("2026-07-23", TZ)).toBe("2026-07-23");
  });

  it("maps a datetime to the local calendar day in the given timezone", () => {
    // 2026-07-22T23:30Z is 2026-07-23 09:30 in Melbourne (+10).
    expect(eventLocalDate("2026-07-22T23:30:00Z", TZ)).toBe("2026-07-23");
  });

  it("returns null for missing or unparseable starts", () => {
    expect(eventLocalDate(null, TZ)).toBeNull();
    expect(eventLocalDate(undefined, TZ)).toBeNull();
    expect(eventLocalDate("not-a-date", TZ)).toBeNull();
  });
});

describe("buildCalendarConflictWarning", () => {
  it("returns null when there are no meeting-with-recipient references", () => {
    const warning = buildCalendarConflictWarning({
      references: [meetingRef({ isMeetingWithRecipient: false })],
      events: [event("2026-07-30")],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).toBeNull();
  });

  it("returns null when an event with the recipient falls on the stated day", () => {
    const warning = buildCalendarConflictWarning({
      references: [meetingRef({ resolvedDate: "2026-07-23" })],
      events: [event("2026-07-23T10:00:00+10:00")],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).toBeNull();
  });

  it("warns (naming the actual date) when the only event with them is a different day", () => {
    const warning = buildCalendarConflictWarning({
      references: [
        meetingRef({ phrase: "talking tomorrow", resolvedDate: "2026-07-23" }),
      ],
      events: [event("2026-07-30T10:00:00+10:00")],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).not.toBeNull();
    expect(warning).toContain("Sarah");
    expect(warning).toContain("talking tomorrow");
    // The stated day (23rd) and the real event day (30th) are both surfaced.
    expect(warning).toContain("23 Jul");
    expect(warning).toContain("30 Jul");
  });

  it("warns that there is no event when the recipient has none on the calendar", () => {
    const warning = buildCalendarConflictWarning({
      references: [meetingRef({ resolvedDate: "2026-07-23" })],
      events: [],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).not.toBeNull();
    expect(warning).toContain("no event with them");
  });

  it("does not warn when at least one stated day matches, even if others exist", () => {
    const warning = buildCalendarConflictWarning({
      references: [meetingRef({ resolvedDate: "2026-07-23" })],
      events: [event("2026-07-23"), event("2026-08-01")],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).toBeNull();
  });

  it("flags the first reference whose day has no matching event", () => {
    const warning = buildCalendarConflictWarning({
      references: [
        meetingRef({ phrase: "our call Thursday", resolvedDate: "2026-07-23" }),
        meetingRef({ phrase: "lunch on Friday", resolvedDate: "2026-07-24" }),
      ],
      // Event matches the first reference's day but not the second's.
      events: [event("2026-07-23")],
      personLabel: "Sarah",
      timezone: TZ,
    });
    expect(warning).not.toBeNull();
    expect(warning).toContain("lunch on Friday");
  });
});
