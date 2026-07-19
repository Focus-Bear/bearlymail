import { google } from "googleapis";

import { CALENDAR_ENTRY_POINT_TYPES } from "../constants/domain-statuses";
import { MILLISECONDS } from "../constants/time-constants";
import { logError } from "../utils/logger";
import type { CalendarService } from "./calendar.service";

const DEFAULT_DURATION_MINUTES = 30;

interface ScheduledEventLookup {
  senderEmail: string;
  proposedTime: string;
  durationMinutes: number | null;
  windowEnd: string | null;
}

/**
 * Looks for an event the user already created from a meeting proposal: an active booking whose guest
 * is the sender and whose start falls inside the proposed slot/window. When one exists we must NOT
 * flag the slot as busy — the only "conflict" is the meeting BearlyMail itself scheduled. Returning
 * the event/Meet links lets the scheduling card re-show "View in Google Calendar" after a remount
 * instead of re-querying free/busy (which would count our own event and report "no free slot").
 * Returns null when no such booking exists, or link-less success info if the event lookup fails.
 */
export async function findExistingScheduledEvent(
  service: CalendarService,
  user: {
    id: string;
    googleCalendarAccessToken: string;
    googleCalendarRefreshToken?: string | null;
  },
  lookup: ScheduledEventLookup,
): Promise<{ eventLink: string | null; meetLink: string | null } | null> {
  const { senderEmail, proposedTime, durationMinutes, windowEnd } = lookup;
  const proposedStart = new Date(proposedTime);
  if (Number.isNaN(proposedStart.getTime())) {
    return null;
  }
  const durationMs =
    (durationMinutes ?? DEFAULT_DURATION_MINUTES) * MILLISECONDS.MINUTE;
  const windowEndDate = windowEnd ? new Date(windowEnd) : null;
  const rangeEnd =
    windowEndDate !== null &&
    !Number.isNaN(windowEndDate.getTime()) &&
    windowEndDate.getTime() > proposedStart.getTime()
      ? windowEndDate
      : new Date(proposedStart.getTime() + durationMs);

  const normalizedSender = senderEmail.trim().toLowerCase();
  const bookings = await service.calendarBookingRepository.find({
    where: { userId: user.id, status: "active" },
  });
  const match = bookings.find((booking) => {
    if (booking.guestEmail?.trim().toLowerCase() !== normalizedSender) {
      return false;
    }
    const bookingStart = new Date(booking.startTime).getTime();
    return (
      !Number.isNaN(bookingStart) &&
      bookingStart >= proposedStart.getTime() &&
      bookingStart < rangeEnd.getTime()
    );
  });
  if (!match || !match.googleEventId) {
    return null;
  }

  try {
    const oauth2Client = service.createOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const event = await calendar.events.get({
      calendarId: "primary",
      eventId: match.googleEventId,
    });
    const meetEntryPoint = event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === CALENDAR_ENTRY_POINT_TYPES.VIDEO,
    );
    return {
      eventLink: event.data.htmlLink ?? null,
      meetLink: meetEntryPoint?.uri ?? null,
    };
  } catch (error) {
    logError(
      "Failed to fetch already-scheduled calendar event for proposal",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { eventLink: null, meetLink: null };
  }
}
