import { BadRequestException, NotFoundException } from "@nestjs/common";
import { calendar_v3, google } from "googleapis";

import { LLM_PROVIDER_STRINGS } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
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
    throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
  }

  const email = await service.emailsService.getEmailById(userId, emailId);
  if (!email) {
    throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
  }

  if (!service.isCalendarInvitation(email)) {
    throw new Error("Email is not a calendar invitation");
  }

  const oauth2Client = service.createOAuth2Client({
    googleCalendarAccessToken: user.googleCalendarAccessToken,
    googleCalendarRefreshToken: user.googleCalendarRefreshToken,
  });

  const calendar = google.calendar({
    version: "v3",
    auth: oauth2Client,
  });

  const userEmail = EncryptionHelper.tryDecrypt(user.email);
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

/**
 * Resolves the scheduling link URL for the given user.
 * Priority order:
 * 1. User profile's calendarBookingUrl (e.g. a Calendly link)
 * 2. CALENDAR_BOOKING_URL environment variable
 * 3. Built-in BearlyMail booking page (/book/{userId})
 */
async function resolveSchedulingLinkUrl(
  service: CalendarService,
  userId: string,
): Promise<string> {
  const user = await service.usersService.findOne(userId);
  const profileUrl = user?.calendarBookingUrl?.trim() || null;
  if (profileUrl) {
    return profileUrl;
  }
  const envUrl = (process.env.CALENDAR_BOOKING_URL || null)?.trim();
  if (envUrl) {
    return envUrl;
  }
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl.replace(/\/$/, "")}/book/${userId}`;
}

export async function generateMeetingReply(
  service: CalendarService,
  userId: string,
  emailId: string,
  provider?: "gemini" | "openai",
): Promise<string> {
  const email = await service.emailsService.getEmailById(userId, emailId);

  if (!email) {
    throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
  }

  const schedulingLinkUrl = await resolveSchedulingLinkUrl(service, userId);

  let llmProvider: LLMProvider | undefined;
  if (provider) {
    llmProvider =
      provider === LLM_PROVIDER_STRINGS.GEMINI
        ? LLMProvider.GEMINI
        : LLMProvider.OPENAI;
  }

  try {
    return await service.llmService.generateMeetingReply(
      {
        from: email.from,
        fromName: email.fromName,
        subject: email.subject,
        body: email.body,
      },
      [],
      schedulingLinkUrl,
      llmProvider,
      userId,
    );
  } catch (error) {
    logError(
      "LLM meeting reply generation failed, using fallback",
      error instanceof Error ? error : new Error(String(error)),
    );
    return `Hi there,

Happy to find a time! You can book a slot that works for you here:
${schedulingLinkUrl}

Looking forward to it!

Best regards`;
  }
}

export interface MeetingProposalResult {
  hasProposal: boolean;
  proposedTime: string | null;
  proposedTimeText: string | null;
  topic: string | null;
  durationMinutes: number | null;
  isAvailable: boolean | null;
  calendarConnected: boolean;
}

const DEFAULT_DURATION_MINUTES = 30;

/**
 * Detects whether the email proposes a specific meeting time and checks calendar availability.
 * Uses the meeting proposal cached during summarization (EmailThread.meetingProposal) when
 * available to avoid an extra LLM call. Falls back to on-demand LLM detection when the
 * cached value is absent (e.g. email was summarised before this feature was deployed).
 */
export async function checkMeetingProposal(
  service: CalendarService,
  userId: string,
  emailId: string,
): Promise<MeetingProposalResult> {
  const email = await service.emailsService.getEmailById(userId, emailId);
  if (!email) {
    throw new Error("Email not found");
  }

  // Use cached meeting proposal from summarization if available, otherwise call LLM.
  let proposal: {
    hasProposal: boolean;
    proposedTime: string | null;
    proposedTimeText: string | null;
    topic: string | null;
    durationMinutes: number | null;
  };

  const thread = email.emailThreadId
    ? await service.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId },
      })
    : null;

  if (thread?.meetingProposal != null) {
    proposal = thread.meetingProposal;
  } else {
    const prefs =
      await service.schedulingPreferencesService.getPreferences(userId);
    proposal = await service.llmService.detectMeetingProposal(
      {
        from: email.from,
        fromName: email.fromName,
        subject: email.subject,
        body: email.body,
      },
      undefined,
      userId,
      prefs.timezone,
    );
  }

  if (!proposal.hasProposal || !proposal.proposedTime) {
    return {
      ...proposal,
      isAvailable: null,
      calendarConnected: false,
    };
  }

  // Check calendar availability
  const user = await service.usersService.findOne(userId);
  if (!user?.googleCalendarAccessToken) {
    return {
      ...proposal,
      isAvailable: null,
      calendarConnected: false,
    };
  }

  try {
    const duration = proposal.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const proposedStart = new Date(proposal.proposedTime);
    const proposedEnd = new Date(
      proposedStart.getTime() + duration * MILLISECONDS.MINUTE,
    );

    const oauth2Client = service.createOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const freebusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: proposedStart.toISOString(),
        timeMax: proposedEnd.toISOString(),
        items: [{ id: "primary" }],
      },
    });

    const busyPeriods = freebusyResponse.data.calendars?.primary?.busy ?? [];
    const isAvailable = busyPeriods.length === 0;

    return {
      ...proposal,
      isAvailable,
      calendarConnected: true,
    };
  } catch (error) {
    logError(
      "Failed to check calendar availability for proposed meeting time",
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      ...proposal,
      isAvailable: null,
      calendarConnected: true,
    };
  }
}

const HTTP_NOT_FOUND = 404;

function getErrCodeForRsvp(err: unknown): string | number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err) return (err as { code?: string | number }).code;
  if ("status" in err) return (err as { status?: number }).status;
  return undefined;
}

export async function rsvpByEventId(
  service: CalendarService,
  userId: string,
  calendarEventId: string,
  response: "accepted" | "declined" | "tentative",
): Promise<{
  userResponseStatus: "accepted" | "declined" | "tentative";
  htmlLink?: string;
}> {
  const user = await service.usersService.findOne(userId);
  if (!user?.googleCalendarAccessToken) {
    throw new BadRequestException(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
  }

  const oauth2Client = service.createOAuth2Client(user);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const userEmail = user.email;

  try {
    const eventResponse = await calendar.events.get({
      calendarId: "primary",
      eventId: calendarEventId,
    });
    const event = eventResponse.data;

    if (!event.attendees || event.attendees.length === 0) {
      throw new BadRequestException(
        "Event has no attendees — RSVP is not applicable",
      );
    }

    const attendeeIndex = event.attendees.findIndex(
      (attendee) => attendee.email?.toLowerCase() === userEmail?.toLowerCase(),
    );

    if (attendeeIndex === -1) {
      throw new BadRequestException("User is not an attendee of this event");
    }

    const updatedAttendees = [...event.attendees];
    updatedAttendees[attendeeIndex] = {
      ...updatedAttendees[attendeeIndex],
      responseStatus: response,
    };

    await calendar.events.patch({
      calendarId: "primary",
      eventId: calendarEventId,
      requestBody: { attendees: updatedAttendees },
    });

    service.logger.log(
      `Successfully updated RSVP for event ${calendarEventId} to ${response}`,
    );

    return {
      userResponseStatus: response,
      htmlLink: event.htmlLink ?? undefined,
    };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    const code = getErrCodeForRsvp(err);
    if (code === HTTP_NOT_FOUND) {
      throw new NotFoundException(
        "Calendar event not found — it may have been deleted",
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    service.logger.error(
      `[RSVP] Unexpected error for event ${calendarEventId}: ${message}`,
    );
    throw new BadRequestException("Failed to update RSVP. Please try again.");
  }
}
