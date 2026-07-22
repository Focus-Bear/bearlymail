import { MeetingDateReference } from "../llm/llm-tone.service";

/**
 * How far ahead of "now" to look for events with the recipient. Meeting
 * references in an outbound email are almost always in the near future; 21 days
 * comfortably covers "next week"/"the 14th" without pulling the whole calendar.
 */
export const CALENDAR_CONFLICT_LOOKAHEAD_DAYS = 21;
/** Small look-back so an event earlier today is still considered. */
export const CALENDAR_CONFLICT_LOOKBACK_DAYS = 1;
/** Only name up to this many actual event dates in the warning to keep it short. */
const MAX_NAMED_EVENT_DATES = 2;
/** ISO date guard: exactly YYYY-MM-DD. */
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Minimal shape of a calendar event needed for the date comparison. */
export interface AttendeeEvent {
  /** ISO datetime, or a bare YYYY-MM-DD for all-day events; may be missing. */
  start: string | null | undefined;
}

/**
 * Resolve an event's start to a local calendar date (YYYY-MM-DD) in the given
 * timezone. All-day events already arrive as a bare date and pass through.
 * Returns null when the start is missing or unparseable.
 */
export function eventLocalDate(
  start: string | null | undefined,
  timezone: string,
): string | null {
  if (!start) {
    return null;
  }
  if (ISO_DATE_ONLY_PATTERN.test(start)) {
    return start;
  }
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    // en-CA formats as YYYY-MM-DD; timeZone maps the instant to the user's day.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/** Human-friendly date label, e.g. "Thu 30 Jul", in the user's timezone. */
function formatDateLabel(isoDate: string, timezone: string): string {
  // Anchor to midday UTC so timezone conversion never rolls the date over.
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return isoDate;
  }
}

/**
 * Compare the meeting-date references extracted from an outbound draft against
 * the events the user actually has with the recipient, and return a single
 * advisory warning string when the stated day does not line up — or null when
 * everything checks out (or there is nothing to check).
 *
 * Pure and deterministic so it can be unit-tested without hitting the calendar.
 */
export function buildCalendarConflictWarning(params: {
  references: MeetingDateReference[];
  events: AttendeeEvent[];
  personLabel: string;
  timezone: string;
}): string | null {
  const { references, events, personLabel, timezone } = params;

  const meetingRefs = references.filter(
    (reference) =>
      reference.isMeetingWithRecipient &&
      ISO_DATE_ONLY_PATTERN.test(reference.resolvedDate),
  );
  if (meetingRefs.length === 0) {
    return null;
  }

  const eventDates = new Set(
    events
      .map((event) => eventLocalDate(event.start, timezone))
      .filter((date): date is string => date !== null),
  );

  // Warn about the first reference whose stated day has no matching event.
  const conflicting = meetingRefs.find(
    (reference) => !eventDates.has(reference.resolvedDate),
  );
  if (!conflicting) {
    return null;
  }

  const statedLabel = formatDateLabel(conflicting.resolvedDate, timezone);

  if (eventDates.size === 0) {
    return (
      `You mention meeting ${personLabel} "${conflicting.phrase}" ` +
      `(around ${statedLabel}), but there's no event with them on your ` +
      `calendar around then. Double-check the date before sending?`
    );
  }

  const namedDates = [...eventDates]
    .sort()
    .slice(0, MAX_NAMED_EVENT_DATES)
    .map((date) => formatDateLabel(date, timezone))
    .join(", ");

  return (
    `You mention meeting ${personLabel} "${conflicting.phrase}" ` +
    `(around ${statedLabel}), but your calendar shows an event with them on ` +
    `${namedDates}, not that day. Double-check the date before sending?`
  );
}
