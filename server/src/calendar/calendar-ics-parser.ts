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
 * Parse a raw ICS string and return structured event data.
 *
 * Throws if the ICS contains no VEVENT or if DTSTART is missing/invalid.
 */
export function parseIcsString(icsString: string): IcsEventData {
  const parsed = ical.sync.parseICS(icsString);

  const eventEntry = Object.values(parsed).find(
    (entry) => entry.type === "VEVENT",
  ) as ical.VEvent | undefined;

  if (!eventEntry) {
    throw new Error("No VEVENT found in ICS attachment");
  }

  const startDate: Date | undefined =
    eventEntry.start instanceof Date ? eventEntry.start : undefined;
  const endDate: Date | undefined =
    eventEntry.end instanceof Date ? eventEntry.end : undefined;

  if (!startDate) {
    throw new Error("ICS VEVENT has no valid DTSTART");
  }

  const extEntry = eventEntry as ical.VEvent & IcsVEventExtra;

  const allDay = extEntry.datetype === "date";
  const organizer = parseOrganizer(extEntry.organizer);
  const attendees = parseAttendees(extEntry.attendee);
  const isRecurring = Boolean(extEntry.rrule);

  // Extract TZID from raw DTSTART property if present
  const tzidMatch = icsString.match(/DTSTART;TZID=([^:]+):/i);
  const timezone = tzidMatch ? tzidMatch[1] : undefined;

  const rawSummary = extEntry.summary;
  const title = typeof rawSummary === "string" ? rawSummary : "(No title)";

  return {
    uid: extEntry.uid ?? crypto.randomUUID(),
    title,
    startAt: startDate.toISOString(),
    endAt: endDate?.toISOString(),
    allDay,
    location:
      typeof extEntry.location === "string" ? extEntry.location : undefined,
    description:
      typeof extEntry.description === "string"
        ? extEntry.description
        : undefined,
    organizer,
    attendees,
    timezone,
    isRecurring,
  };
}
