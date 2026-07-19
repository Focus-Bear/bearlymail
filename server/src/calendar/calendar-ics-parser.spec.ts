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

// Real-world Google Calendar "decline + propose new time" reply. The
// X-RESPONSE-COMMENT contains an escaped semicolon (`\;`, from the HTML
// entity `&rsquo;`) that node-ical's own param parser mis-splits — this is
// exactly the shape that motivated the raw-regex extractAttendeeComment().
const COUNTER_ICS = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:COUNTER
BEGIN:VEVENT
DTSTART:20260716T000000Z
DTEND:20260716T003000Z
DTSTAMP:20260708T232943Z
ORGANIZER;CN=jeremy@focusbear.io:mailto:jeremy@focusbear.io
UID:f3a7pmefdvh0bpftdscvssu6jg@google.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Summer
  Petrosius;X-NUM-GUESTS=0;X-RESPONSE-COMMENT="Sorry! I&rsquo\\;ve woken up w
 ith a bad head cold and no voice":mailto:summer@kindship.com.au
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Fundraising tips and Snowie Fellowship
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

const NO_METHOD_ICS = VALID_ICS;

const QUOTE_ESCAPED_COMMENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:COUNTER
BEGIN:VEVENT
UID:quote-escape-uid@example.com
DTSTART:20240315T100000Z
DTEND:20240315T110000Z
SUMMARY:Escaped Comment Meeting
ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;X-RESPONSE-COMMENT="Comma\\, semicolon\\; and backslash\\\\ walk into a bar":mailto:bob@example.com
END:VEVENT
END:VCALENDAR`;

// RFC 5545 also allows an UNQUOTED param value when it has no special chars.
const UNQUOTED_COMMENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:COUNTER
BEGIN:VEVENT
UID:unquoted-comment-uid@example.com
DTSTART:20240315T100000Z
DTEND:20240315T110000Z
SUMMARY:Unquoted Comment Meeting
ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;X-RESPONSE-COMMENT=Sorry:mailto:bob@example.com
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

    it("leaves method undefined when the ics has no METHOD property", () => {
      const result = parseIcsStringSafe(NO_METHOD_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.method).toBeUndefined();
    });
  });

  describe("METHOD:COUNTER reschedule requests", () => {
    it("extracts method=COUNTER from the vcalendar/vevent METHOD property", () => {
      const result = parseIcsStringSafe(COUNTER_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.method).toBe("COUNTER");
    });

    it("extracts startAt/endAt as the countering attendee's proposed new time", () => {
      const result = parseIcsStringSafe(COUNTER_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.startAt).toBe("2026-07-16T00:00:00.000Z");
      expect(result.event.endAt).toBe("2026-07-16T00:30:00.000Z");
    });

    it("correctly decodes X-RESPONSE-COMMENT despite node-ical's param-parsing bug on escaped semicolons", () => {
      const result = parseIcsStringSafe(COUNTER_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.attendees).toHaveLength(1);
      expect(result.event.attendees[0].email).toBe("summer@kindship.com.au");
      expect(result.event.attendees[0].name).toBe("Summer Petrosius");
      // Regression: node-ical's own attendee.params["X-RESPONSE-COMMENT"]
      // truncates to `"Sorry! I&rsquo\` at the escaped semicolon — the raw-ICS
      // regex extractor must recover the full, correctly decoded text.
      expect(result.event.attendees[0].comment).toBe(
        "Sorry! I’ve woken up with a bad head cold and no voice",
      );
    });

    it("unescapes backslash-escaped comma, semicolon, and backslash in a comment", () => {
      const result = parseIcsStringSafe(QUOTE_ESCAPED_COMMENT_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.attendees[0].comment).toBe(
        "Comma, semicolon; and backslash\\ walk into a bar",
      );
    });

    it("extracts an unquoted X-RESPONSE-COMMENT value (RFC 5545 paramtext)", () => {
      const result = parseIcsStringSafe(UNQUOTED_COMMENT_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.attendees[0].comment).toBe("Sorry");
    });

    it("leaves comment undefined when no X-RESPONSE-COMMENT param is present", () => {
      const result = parseIcsStringSafe(VALID_ICS);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.attendees[0].comment).toBeUndefined();
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
