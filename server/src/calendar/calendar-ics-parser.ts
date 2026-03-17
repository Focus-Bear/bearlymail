/**
 * Pure ICS parsing helpers extracted from CalendarService.
 * Extracted as part of issue #939 — pending decomposition batch 2.
 *
 * The main export is parseIcsString() which converts a raw ICS string into
 * an IcsEventData object.  CalendarService.parseIcsAttachment() now fetches
 * the attachment buffer, then delegates to this function.
 */

import * as ical from "node-ical";

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
    });
  }

  return attendees;
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
    attendees = parseAttendees(extEntry.attendee);
  } catch {
    attendees = [];
  }

  const tzidMatch = icsString.match(/DTSTART;TZID=([^:]+):/i);
  const timezone = tzidMatch ? tzidMatch[1] : undefined;
  const title =
    typeof extEntry.summary === "string" ? extEntry.summary : "(No title)";

  return {
    ok: true,
    event: {
      uid: extEntry.uid ?? crypto.randomUUID(),
      title,
      startAt: startDate.toISOString(),
      endAt: endDate?.toISOString(),
      allDay: extEntry.datetype === "date",
      location:
        typeof extEntry.location === "string" ? extEntry.location : undefined,
      description:
        typeof extEntry.description === "string"
          ? extEntry.description
          : undefined,
      organizer,
      attendees,
      timezone,
      isRecurring: Boolean(extEntry.rrule),
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
