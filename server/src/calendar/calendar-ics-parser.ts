/**
 * Pure ICS parsing helpers extracted from CalendarService.
 * Extracted as part of issue #939 — pending decomposition batch 2.
 *
 * The main export is parseIcsString() which converts a raw ICS string into
 * an IcsEventData object.  CalendarService.parseIcsAttachment() now fetches
 * the attachment buffer, then delegates to this function.
 */

import * as ical from "node-ical";

import { ICS_DATE_TYPES } from "../constants/domain-types";
import { mapToIANATimezone } from "../utils/timezone.utils";
import { IcsAttendee, IcsEventData } from "./ics-event.types";

/**
 * node-ical VEvent does not declare all properties in its type definition.
 * We intersect extra types here to avoid unsafe casts throughout the parser.
 * (We do NOT extend VEvent to avoid TS2430 property type conflicts.)
 */
interface IcsVEventExtra {
  /** "date" for all-day events, "date-time" for timed events */
  datetype?: string;
  /** Raw attendee value(s) — single object or array */
  attendee?: ical.Attendee | ical.Attendee[];
  /** RRULE recurrence rule object */
  rrule?: unknown;
}

/** Structured result type allowing callers to distinguish parse errors from events */
export type ParseIcsResult =
  | { ok: true; event: IcsEventData }
  | { ok: false; error: string };

/**
 * Extract a plain string from a node-ical field that may be either a raw
 * string or a parameterised object `{ val: string, params: {...} }`.
 *
 * node-ical parses `SUMMARY;LANGUAGE=en-US:Focus Bear x RMIT` as
 * `{ val: "Focus Bear x RMIT", params: { LANGUAGE: "en-US" } }` instead of
 * a plain string.  This helper normalises both shapes.
 *
 * Returns `undefined` for empty strings so callers can use `?? fallback`.
 */
export function extractStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (value !== null && typeof value === "object" && "val" in value) {
    const rawVal = (value as Record<string, unknown>)["val"];
    return typeof rawVal === "string" ? rawVal || undefined : undefined;
  }
  return undefined;
}

function parseOrganizer(
  rawOrganizer: ical.VEvent["organizer"],
): IcsEventData["organizer"] | undefined {
  if (!rawOrganizer) return undefined;
  const org = rawOrganizer as ical.Organizer;
  const raw: string = typeof org === "string" ? org : (org.val ?? "");
  const email = raw.replace(/^mailto:/i, "").trim();
  const rawCn = typeof org === "object" ? org.params?.CN : undefined;
  const cn: string | undefined = typeof rawCn === "string" ? rawCn : undefined;
  return { email, name: cn };
}

function parseAttendees(
  rawAttendees: IcsVEventExtra["attendee"],
  icsString: string,
): IcsAttendee[] {
  const attendees: IcsAttendee[] = [];
  let attendeeList: ical.Attendee[];

  if (!rawAttendees) {
    attendeeList = [];
  } else if (Array.isArray(rawAttendees)) {
    attendeeList = rawAttendees;
  } else {
    attendeeList = [rawAttendees];
  }

  for (const att of attendeeList) {
    const rawVal: string = typeof att === "string" ? att : (att.val ?? "");
    const email = rawVal.replace(/^mailto:/i, "").trim();
    if (!email) continue;
    const params = typeof att === "object" ? (att.params ?? {}) : {};
    attendees.push({
      email,
      name: typeof params.CN === "string" ? params.CN : undefined,
      status: typeof params.PARTSTAT === "string" ? params.PARTSTAT : undefined,
      comment: extractAttendeeComment(icsString, email),
    });
  }

  return attendees;
}

/** Named HTML entities Google Calendar has been observed emitting inside X-RESPONSE-COMMENT. */
const ICS_TEXT_ENTITY_MAP: Record<string, string> = {
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * Un-fold ICS content lines (RFC 5545 §3.1): a line beginning with a single
 * SPACE or TAB is a continuation of the previous line. Needed before regexing
 * a property that may have been wrapped across multiple physical lines.
 */
function unfoldIcsLines(icsString: string): string[] {
  const rawLines = icsString.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Un-escape RFC 5545 backslash escaping (\\, \;, \,, \n) and decode the small
 * set of HTML entities Google Calendar emits inside X-RESPONSE-COMMENT.
 */
function decodeIcsAttendeeComment(raw: string): string {
  const unescaped = raw.replace(/\\(.)/g, (_match, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
  let decoded = unescaped;
  for (const [entity, char] of Object.entries(ICS_TEXT_ENTITY_MAP)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded.trim();
}

/**
 * Extract a single attendee's X-RESPONSE-COMMENT directly from the raw ICS
 * text, rather than trusting node-ical's parsed `params`.
 *
 * node-ical mis-splits a quoted parameter value that contains an escaped
 * semicolon (`\;`) — which Google Calendar's X-RESPONSE-COMMENT routinely
 * does, since it escapes the semicolon inside HTML entities like `&rsquo;`.
 * That truncates the parsed comment mid-word. Regexing the raw (unfolded)
 * ATTENDEE line side-steps the bug entirely.
 */
function extractAttendeeComment(
  icsString: string,
  attendeeEmail: string,
): string | undefined {
  const emailLower = attendeeEmail.toLowerCase();
  const attendeeLine = unfoldIcsLines(icsString).find(
    (line) =>
      line.toUpperCase().startsWith("ATTENDEE") &&
      line.toLowerCase().includes(`mailto:${emailLower}`),
  );
  if (!attendeeLine) return undefined;

  // RFC 5545 allows an unquoted param value (paramtext) as well as a quoted
  // one — match both, preferring the quoted (escaped) capture group.
  const match = attendeeLine.match(
    /X-RESPONSE-COMMENT=(?:"((?:\\.|[^"\\])*)"|([^;:]*))/i,
  );
  if (!match) return undefined;

  const rawComment = match[1] !== undefined ? match[1] : match[2];
  const decoded = decodeIcsAttendeeComment(rawComment);
  return decoded || undefined;
}

/**
 * Parse a raw ICS string and return a structured result object.
 *
 * Unlike throwing directly, this returns { ok: false, error } for all
 * well-understood failure modes (empty string, no VEVENT, missing DTSTART,
 * malformed dates, ical parse exceptions) so callers can decide how to surface
 * the error without catching unhandled exceptions.
 *
 * Use the throwing wrapper `parseIcsString()` for call-sites that prefer
 * exception-based control flow (legacy API).
 */
export function parseIcsStringSafe(icsString: string): ParseIcsResult {
  if (!icsString || !icsString.trim()) {
    return { ok: false, error: "ICS string is empty" };
  }

  let parsed: ical.CalendarResponse;
  try {
    parsed = ical.sync.parseICS(icsString);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to parse ICS data: ${message}` };
  }

  const eventEntry = Object.values(parsed).find(
    (entry) => entry.type === "VEVENT",
  ) as ical.VEvent | undefined;

  if (!eventEntry) {
    return { ok: false, error: "No VEVENT found in ICS attachment" };
  }

  return buildEventResult(eventEntry, icsString);
}

/**
 * Build the IcsEventData from a parsed VEvent entry.
 * Extracted to keep parseIcsStringSafe under the statement limit.
 */
function buildEventResult(
  eventEntry: ical.VEvent,
  icsString: string,
): ParseIcsResult {
  const extEntry = eventEntry as ical.VEvent & IcsVEventExtra;

  const startDate = safeDate(eventEntry.start);
  if (!startDate) {
    return { ok: false, error: "ICS VEVENT has no valid DTSTART" };
  }

  const endDate = safeDate(eventEntry.end);

  let organizer: IcsEventData["organizer"] | undefined;
  try {
    organizer = parseOrganizer(extEntry.organizer);
  } catch {
    organizer = undefined;
  }

  let attendees: IcsAttendee[] = [];
  try {
    attendees = parseAttendees(extEntry.attendee, icsString);
  } catch {
    attendees = [];
  }

  const tzidMatch = icsString.match(/DTSTART;TZID=([^:]+):/i);
  const rawTimezone = tzidMatch ? tzidMatch[1] : undefined;
  const timezone = rawTimezone ? mapToIANATimezone(rawTimezone) : undefined;
  // Use extractStringValue() so SUMMARY;LANGUAGE=en-US:... (parsed as
  // { val, params }) is handled correctly alongside plain string values.
  const title = extractStringValue(extEntry.summary) ?? "(No title)";

  return {
    ok: true,
    event: {
      uid: extEntry.uid ?? crypto.randomUUID(),
      title,
      startAt: startDate.toISOString(),
      endAt: endDate?.toISOString(),
      allDay: extEntry.datetype === ICS_DATE_TYPES.DATE,
      location: extractStringValue(extEntry.location),
      description: extractStringValue(extEntry.description),
      organizer,
      attendees,
      timezone,
      isRecurring: Boolean(extEntry.rrule),
      method: typeof extEntry.method === "string" ? extEntry.method : undefined,
    },
  };
}

/** Return a valid Date or undefined — never throws. */
function safeDate(value: unknown): Date | undefined {
  try {
    if (!(value instanceof Date)) return undefined;
    return isNaN(value.getTime()) ? undefined : value;
  } catch {
    return undefined;
  }
}

/**
 * Parse a raw ICS string and return structured event data.
 *
 * Throws if the ICS is empty, contains no VEVENT, DTSTART is missing/invalid,
 * or the ICS data cannot be parsed.
 *
 * @deprecated Prefer `parseIcsStringSafe()` for new call-sites; it returns a
 *   structured result instead of throwing so callers can map to HTTP errors.
 */
export function parseIcsString(icsString: string): IcsEventData {
  const result = parseIcsStringSafe(icsString);
  if (result.ok === false) {
    throw new Error(result.error);
  }
  return result.event;
}
