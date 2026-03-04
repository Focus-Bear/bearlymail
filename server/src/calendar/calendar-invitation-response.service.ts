import { calendar_v3, google } from "googleapis";

import { MILLISECONDS } from "../constants/time-constants";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMProvider } from "../llm/llm.types";
import { logError } from "../utils/logger";
import type { CalendarService } from "./calendar.service";

const ICAL_DATE_MIN_LENGTH = 8;
const ICAL_YEAR_END = 4;
const ICAL_MONTH_START = 4;
const ICAL_MONTH_END = 6;
const ICAL_DAY_START = 6;
const ICAL_DAY_END = 8;
const ICAL_HOUR_START = 9;
const ICAL_HOUR_END = 11;
const ICAL_MINUTE_START = 11;
const ICAL_MINUTE_END = 13;
const ICAL_DATE_WITH_HOURS_LENGTH = 10;
const DAYS_BACK_FOR_EVENT_MATCH = 30;
const DAYS_AHEAD_FOR_EVENT_MATCH = 90;
const DAYS_AROUND_EXACT_MATCH = 7;
const MAX_EVENT_SEARCH_RESULTS = 100;

function extractIcalMetadata(body: string): {
  icalUID: string | null;
  eventDate: Date | null;
} {
  const uidMatch = body.match(/UID:([^\s\r\n]+)/i);
  const icalUID = uidMatch?.[1]?.trim() || null;

  let eventDate: Date | null = null;
  const dtStartMatch = body.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6}Z?|\d{8})/i);
  if (!dtStartMatch?.[1]) {
    return { icalUID, eventDate };
  }

  const dateStr = dtStartMatch[1];
  try {
    if (dateStr.length >= ICAL_DATE_MIN_LENGTH) {
      const year = parseInt(dateStr.substring(0, ICAL_YEAR_END), 10);
      const month = parseInt(
        dateStr.substring(ICAL_MONTH_START, ICAL_MONTH_END),
        10,
      );
      const day = parseInt(dateStr.substring(ICAL_DAY_START, ICAL_DAY_END), 10);

      if (dateStr.length > ICAL_DATE_WITH_HOURS_LENGTH) {
        const hour = parseInt(
          dateStr.substring(ICAL_HOUR_START, ICAL_HOUR_END),
          10,
        );
        const minute = parseInt(
          dateStr.substring(ICAL_MINUTE_START, ICAL_MINUTE_END),
          10,
        );
        eventDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
      } else {
        eventDate = new Date(year, month - 1, day);
      }
    }
  } catch (error) {
    logError(
      "Error parsing DTSTART",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  return { icalUID, eventDate };
}

function eventMatchesInvitation(
  event: calendar_v3.Schema$Event,
  icalUID: string | null,
  cleanSubject: string,
  organizerEmail: string | null | undefined,
): boolean {
  if (!event.id) {
    return false;
  }

  if (icalUID && event.iCalUID === icalUID) {
    return true;
  }

  if (event.summary) {
    const eventSummary = event.summary.toLowerCase();
    if (
      cleanSubject.includes(eventSummary) ||
      eventSummary.includes(cleanSubject)
    ) {
      return true;
    }
  }

  if (event.organizer?.email && organizerEmail) {
    if (event.organizer.email.toLowerCase() === organizerEmail.toLowerCase()) {
      return true;
    }
  }

  return false;
}

async function findEventIdForInvitation(
  calendar: ReturnType<typeof google.calendar>,
  cleanSubject: string,
  icalUID: string | null,
  eventDate: Date | null,
  organizerEmail: string | null | undefined,
): Promise<string | null> {
  try {
    const timeMin = eventDate
      ? new Date(
          eventDate.getTime() - DAYS_AROUND_EXACT_MATCH * MILLISECONDS.DAY,
        )
      : new Date(Date.now() - DAYS_BACK_FOR_EVENT_MATCH * MILLISECONDS.DAY);
    const timeMax = eventDate
      ? new Date(
          eventDate.getTime() + DAYS_BACK_FOR_EVENT_MATCH * MILLISECONDS.DAY,
        )
      : new Date(Date.now() + DAYS_AHEAD_FOR_EVENT_MATCH * MILLISECONDS.DAY);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: MAX_EVENT_SEARCH_RESULTS,
      singleEvents: true,
      orderBy: "startTime",
      q: cleanSubject || undefined,
    });

    const matchingEvent = (response.data.items || []).find((event) =>
      eventMatchesInvitation(event, icalUID, cleanSubject, organizerEmail),
    );

    if (matchingEvent?.id) {
      return matchingEvent.id;
    }
  } catch (error) {
    logError(
      "Error searching for calendar event",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  try {
    const timeMin = new Date(
      Date.now() - DAYS_BACK_FOR_EVENT_MATCH * MILLISECONDS.DAY,
    );
    const timeMax = new Date(
      Date.now() + DAYS_AHEAD_FOR_EVENT_MATCH * MILLISECONDS.DAY,
    );
    const pendingResponse = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: MAX_EVENT_SEARCH_RESULTS,
      singleEvents: true,
      orderBy: "startTime",
    });

    const pendingEvent = (pendingResponse.data.items || []).find((event) =>
      eventMatchesInvitation(event, icalUID, cleanSubject, organizerEmail),
    );

    return pendingEvent?.id || null;
  } catch (error) {
    logError(
      "Error searching for pending invitations",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  return null;
}

async function updateAttendeeResponseStatus(
  service: CalendarService,
  calendar: ReturnType<typeof google.calendar>,
  eventId: string,
  userEmail: string | null,
  response: "accepted" | "declined" | "tentative",
): Promise<void> {
  const event = await calendar.events.get({
    calendarId: "primary",
    eventId,
  });

  if (!event.data.attendees) {
    throw new Error("Event has no attendees");
  }

  const attendeeIndex = event.data.attendees.findIndex(
    (attendee) => attendee.email?.toLowerCase() === userEmail?.toLowerCase(),
  );

  if (attendeeIndex === -1) {
    throw new Error("User is not an attendee of this event");
  }

  const responseStatus = response;
  const updatedAttendees = [...(event.data.attendees || [])];
  updatedAttendees[attendeeIndex] = {
    ...updatedAttendees[attendeeIndex],
    responseStatus,
  };

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      attendees: updatedAttendees,
    },
  });

  service.logger.log(
    `Successfully responded to calendar invitation: ${eventId}`,
  );
}

export async function respondToInvitation(
  service: CalendarService,
  userId: string,
  emailId: string,
  response: "accepted" | "declined" | "tentative",
): Promise<void> {
  const user = await service.usersService.findOne(userId);
  if (!user?.googleCalendarAccessToken) {
    throw new Error("Google Calendar not connected");
  }

  const email = await service.emailsService.getEmailById(userId, emailId);
  if (!email) {
    throw new Error("Email not found");
  }

  if (!service.isCalendarInvitation(email)) {
    throw new Error("Email is not a calendar invitation");
  }

  service.oauth2Client.setCredentials({
    access_token: user.googleCalendarAccessToken,
    refresh_token: user.googleCalendarRefreshToken,
  });

  const calendar = google.calendar({
    version: "v3",
    auth: service.oauth2Client,
  });

  const userEmail = EncryptionHelper.decrypt(user.email);
  const subject = email.subject || "";
  const body = email.body || email.htmlBody || "";
  const organizerEmail = email.from;

  const { icalUID, eventDate } = extractIcalMetadata(body);
  const cleanSubject = subject
    .replace(/^(re:|fwd?:|invitation:|invite:)\s*/i, "")
    .trim()
    .toLowerCase();

  const eventId = await findEventIdForInvitation(
    calendar,
    cleanSubject,
    icalUID,
    eventDate,
    organizerEmail,
  );

  if (!eventId) {
    service.logger.error(
      `Could not find calendar event for email ${emailId}, subject: ${subject}`,
    );
    throw new Error(
      "Could not find the calendar event. This may happen if the invitation was not automatically added to your calendar. Please try responding directly in Google Calendar.",
    );
  }

  try {
    await updateAttendeeResponseStatus(
      service,
      calendar,
      eventId,
      userEmail,
      response,
    );
  } catch (error) {
    logError(
      "Error updating calendar event",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw new Error(
      `Failed to respond to invitation: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function generateMeetingReply(
  service: CalendarService,
  userId: string,
  emailId: string,
  provider?: "gemini" | "openai",
): Promise<string> {
  const slots = await service.getAvailableTimeSlots(userId);
  const email = await service.emailsService.getEmailById(userId, emailId);

  if (!email) {
    throw new Error("Email not found");
  }

  if (slots.length === 0) {
    try {
      let llmProvider: LLMProvider | undefined;
      if (provider) {
        llmProvider =
          provider === "gemini" ? LLMProvider.GEMINI : LLMProvider.OPENAI;
      }
      return await service.llmService.generateMeetingReply(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        [],
        process.env.CALENDAR_BOOKING_URL,
        llmProvider,
        userId,
      );
    } catch (error) {
      return `Hi there,

Thank you for reaching out about scheduling a meeting. Unfortunately, I don't have any available slots in the next week.

Please let me know your availability and I'll do my best to accommodate.

Best regards`;
    }
  }

  const formattedSlots = slots.slice(0, 5).map((slot) => ({
    start: slot.start,
    end: slot.end,
  }));

  try {
    let llmProvider: LLMProvider | undefined;
    if (provider) {
      llmProvider =
        provider === "gemini" ? LLMProvider.GEMINI : LLMProvider.OPENAI;
    }
    return await service.llmService.generateMeetingReply(
      {
        from: email.from,
        fromName: email.fromName,
        subject: email.subject,
        body: email.body,
      },
      formattedSlots,
      process.env.CALENDAR_BOOKING_URL,
      llmProvider,
      userId,
    );
  } catch (error) {
    logError(
      "LLM meeting reply generation failed, using fallback",
      error instanceof Error ? error : new Error(String(error)),
    );
    const slotsText = slots
      .slice(0, 5)
      .map((slot, i) => {
        const start = new Date(slot.start);
        return `${i + 1}. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      })
      .join("\n");

    return `Hi there,

Thank you for reaching out about scheduling a meeting. Here are some times that work for me:

${slotsText}

You can also book directly on my calendar: ${process.env.CALENDAR_BOOKING_URL || "https://calendly.com/your-link"}

Let me know what works best for you!

Best regards`;
  }
}
