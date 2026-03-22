/**
 * Tests for calendar-ics-parser — focuses on the error-handling paths
 * introduced in issue #1100 (ICS crash fix).
 */

import {
  extractStringValue,
  parseIcsString,
  parseIcsStringSafe,
} from "./calendar-ics-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-uid-1@example.com
DTSTART:20240315T100000Z
DTEND:20240315T110000Z
SUMMARY:Team Standup
ORGANIZER;CN=Alice:mailto:alice@example.com
ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED:mailto:bob@example.com
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:all-day-uid@example.com
DTSTART;VALUE=DATE:20240315
DTEND;VALUE=DATE:20240316
SUMMARY:Company Holiday
END:VEVENT
END:VCALENDAR`;

const NO_VEVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
END:VTIMEZONE
END:VCALENDAR`;

const NO_DTSTART_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:no-dtstart@example.com
SUMMARY:Missing Start
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-uid@example.com
DTSTART:20240315T100000Z
DTEND:20240315T110000Z
SUMMARY:Weekly Sync
RRULE:FREQ=WEEKLY;COUNT=10
END:VEVENT
END:VCALENDAR`;

const TZID_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:tzid-uid@example.com
DTSTART;TZID=America/New_York:20240315T100000
DTEND;TZID=America/New_York:20240315T110000
SUMMARY:New York Meeting
END:VEVENT
END:VCALENDAR`;

const WINDOWS_TZ_AUS_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
BEGIN:VEVENT
UID:windows-tz-aus@example.com
DTSTART;TZID=AUS Eastern Standard Time:20240315T100000
DTEND;TZID=AUS Eastern Standard Time:20240315T110000
SUMMARY:Sydney Meeting
END:VEVENT
END:VCALENDAR`;

const WINDOWS_TZ_EASTERN_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
BEGIN:VEVENT
UID:windows-tz-eastern@example.com
DTSTART;TZID=Eastern Standard Time:20240315T100000
DTEND;TZID=Eastern Standard Time:20240315T110000
SUMMARY:New York Meeting (Outlook)
END:VEVENT
END:VCALENDAR`;

// ---------------------------------------------------------------------------
// parseIcsStringSafe
// ---------------------------------------------------------------------------

describe("parseIcsStringSafe", () => {
  describe("valid ICS", () => {
    it("parses a standard timed VEVENT", () => {
      const result = parseIcsStringSafe(VALID_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.title).toBe("Team Standup");
      expect(result.event.startAt).toBe("2024-03-15T10:00:00.000Z");
      expect(result.event.endAt).toBe("2024-03-15T11:00:00.000Z");
      expect(result.event.allDay).toBe(false);
      expect(result.event.isRecurring).toBe(false);
    });

    it("parses an all-day event", () => {
      const result = parseIcsStringSafe(ALL_DAY_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.allDay).toBe(true);
      expect(result.event.title).toBe("Company Holiday");
    });

    it("parses a recurring event", () => {
      const result = parseIcsStringSafe(RECURRING_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.isRecurring).toBe(true);
    });

    it("extracts TZID from DTSTART (valid IANA passthrough)", () => {
      const result = parseIcsStringSafe(TZID_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.timezone).toBe("America/New_York");
    });

    it("maps Windows TZID 'AUS Eastern Standard Time' → 'Australia/Sydney'", () => {
      const result = parseIcsStringSafe(WINDOWS_TZ_AUS_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.timezone).toBe("Australia/Sydney");
    });

    it("maps Windows TZID 'Eastern Standard Time' → 'America/New_York'", () => {
      const result = parseIcsStringSafe(WINDOWS_TZ_EASTERN_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.timezone).toBe("America/New_York");
    });

    it("parses organizer name and email", () => {
      const result = parseIcsStringSafe(VALID_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.organizer?.email).toBe("alice@example.com");
      expect(result.event.organizer?.name).toBe("Alice");
    });

    it("parses attendees with status", () => {
      const result = parseIcsStringSafe(VALID_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.attendees).toHaveLength(1);
      expect(result.event.attendees[0].email).toBe("bob@example.com");
      expect(result.event.attendees[0].status).toBe("ACCEPTED");
    });

    it("uses (No title) when SUMMARY is absent", () => {
      const noSummaryIcs = VALID_ICS.replace(/SUMMARY:.*\n/, "");
      const result = parseIcsStringSafe(noSummaryIcs);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.title).toBe("(No title)");
    });

    it("generates a UID when none is present in the VEVENT", () => {
      const noUidIcs = VALID_ICS.replace(/UID:.*\n/, "");
      const result = parseIcsStringSafe(noUidIcs);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.uid).toBeTruthy();
    });
  });

  describe("malformed / edge-case ICS", () => {
    it("returns ok=false for an empty string", () => {
      const result = parseIcsStringSafe("");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/empty/i);
    });

    it("returns ok=false for a whitespace-only string", () => {
      const result = parseIcsStringSafe("   \n\t  ");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/empty/i);
    });

    it("returns ok=false when there is no VEVENT", () => {
      const result = parseIcsStringSafe(NO_VEVENT_ICS);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/VEVENT/i);
    });

    it("returns ok=false when DTSTART is missing", () => {
      const result = parseIcsStringSafe(NO_DTSTART_ICS);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/DTSTART/i);
    });

    it("returns ok=false for completely garbled input", () => {
      const result = parseIcsStringSafe("not an ics file at all %%% @@@ ###");

      // node-ical may parse without throwing but produce no VEVENT
      // OR throw — either way we expect ok=false
      expect(result.ok).toBe(false);
    });

    it("returns ok=false for truncated ICS (no END:VCALENDAR)", () => {
      const truncated = VALID_ICS.split("\n").slice(0, 6).join("\n");
      const result = parseIcsStringSafe(truncated);

      // A truncated ICS should not throw; it should return an error result
      expect(result.ok).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// parseIcsString (legacy throwing wrapper)
// ---------------------------------------------------------------------------

describe("parseIcsString", () => {
  it("returns event data for valid ICS", () => {
    const event = parseIcsString(VALID_ICS);
    expect(event.title).toBe("Team Standup");
  });

  it("throws for empty string", () => {
    expect(() => parseIcsString("")).toThrow(/empty/i);
  });

  it("throws when there is no VEVENT", () => {
    expect(() => parseIcsString(NO_VEVENT_ICS)).toThrow(/VEVENT/i);
  });

  it("throws when DTSTART is missing", () => {
    expect(() => parseIcsString(NO_DTSTART_ICS)).toThrow(/DTSTART/i);
  });
});

// ---------------------------------------------------------------------------
// extractStringValue
// ---------------------------------------------------------------------------

describe("extractStringValue", () => {
  it("returns a plain string as-is", () => {
    expect(extractStringValue("hello")).toBe("hello");
  });

  it("returns the val property from a {val, params} object", () => {
    expect(
      extractStringValue({ val: "text", params: { LANGUAGE: "en-US" } }),
    ).toBe("text");
  });

  it("returns undefined for null", () => {
    expect(extractStringValue(null)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(extractStringValue("")).toBeUndefined();
  });

  it("returns undefined when val is an empty string", () => {
    expect(extractStringValue({ val: "" })).toBeUndefined();
  });

  it("returns undefined for a number", () => {
    expect(extractStringValue(42)).toBeUndefined();
  });

  it("returns undefined when val is a number", () => {
    expect(extractStringValue({ val: 99 })).toBeUndefined();
  });
});
