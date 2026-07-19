import { calendar_v3 } from "googleapis";

import { logError } from "../utils/logger";

/** A calendar event that overlaps the proposed slot. */
export interface ConflictingEvent {
  /** Event summary; null when the event has no title (client renders a placeholder). */
  title: string | null;
  /** ISO datetime, or bare YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
}

/** How many overlapping events to name in the conflict warning. */
const MAX_CONFLICTING_EVENTS = 3;

/**
 * How many events to fetch before filtering. Larger than MAX_CONFLICTING_EVENTS
 * because events marked free (transparency: "transparent") are dropped after the
 * fetch — with maxResults = 3, three "free" events would crowd out real conflicts.
 */
const CONFLICT_LOOKUP_PAGE_SIZE = 10;

/** Google Calendar transparency value for events marked "free" (ignored by freebusy). */
const EVENT_TRANSPARENCY_FREE = "transparent";

/**
 * Fetches the events behind a busy verdict so the UI can say WHAT the conflict
 * is — freebusy.query only returns anonymous time ranges. Skips events marked
 * free (transparency: "transparent"), matching freebusy semantics. Best-effort:
 * returns [] on any error so the availability verdict itself is unaffected.
 */
export async function listConflictingEvents(
  calendar: calendar_v3.Calendar,
  timeMin: Date,
  timeMax: Date,
): Promise<ConflictingEvent[]> {
  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: CONFLICT_LOOKUP_PAGE_SIZE,
    });
    return (response.data.items ?? [])
      .filter((event) => event.transparency !== EVENT_TRANSPARENCY_FREE)
      .slice(0, MAX_CONFLICTING_EVENTS)
      .map((event) => ({
        title: event.summary ?? null,
        start: event.start?.dateTime ?? event.start?.date ?? "",
        end: event.end?.dateTime ?? event.end?.date ?? "",
      }));
  } catch (error) {
    logError(
      "Failed to fetch conflicting events for busy slot",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}
