import { BadRequestException, NotFoundException } from "@nestjs/common";
import { calendar_v3, google } from "googleapis";

import { LLM_PROVIDER_STRINGS } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS } from "../constants/time-constants";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMProvider } from "../llm/llm.types";
import { createLogger, logError } from "../utils/logger";
import { convertLocalTimeInZoneToUtc } from "../utils/meeting-time.util";
import type { CalendarService } from "./calendar.service";
import {
  ConflictingEvent,
  listConflictingEvents,
} from "./calendar-conflicting-events.helper";
import { findExistingScheduledEvent } from "./scheduled-event-lookup.helper";

const proposalLog = createLogger("CalendarMeetingProposal");

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
    id: user.id,
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

  // Pull writing-style examples from the user's "How I write emails" settings
  // so meeting replies match the same tone as regular suggested replies
  // (see replies.service.ts:generateDraftReply for the canonical filter).
  const user = await service.usersService.findOne(userId);
  const toneRules = user?.toneSettings?.rules || [];
  const emailExamples = toneRules.filter(
    (rule: string) =>
      !rule.startsWith("Tone:") &&
      !rule.startsWith("Style:") &&
      !rule.startsWith("Common phrase:"),
  );

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
      { emailExamples },
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

export { ConflictingEvent } from "./calendar-conflicting-events.helper";

export interface MeetingProposalResult {
  hasProposal: boolean;
  proposedTime: string | null;
  /** End of the proposed window when the sender gave a range (e.g. "between 1 and 4"); null for a fixed time. */
  windowEnd: string | null;
  /**
   * Naive ISO date (YYYY-MM-DD) the sender named without a time of day (e.g. "the 9th of July").
   * The proposed/suggested time is filled in from the recipient's own working hours. null when the
   * sender gave an explicit time or window.
   */
  proposedDate: string | null;
  proposedTimeText: string | null;
  topic: string | null;
  durationMinutes: number | null;
  isAvailable: boolean | null;
  /**
   * UTC ISO start of a free slot of the meeting's length. For a single fixed time this equals
   * proposedTime when free; for a window it's the first free slot found inside it. null if no slot
   * is free (conflict) or availability could not be checked.
   */
  suggestedTime: string | null;
  calendarConnected: boolean;
  /**
   * True when the user has already created an event for this proposal (an active booking with the
   * sender as guest at the proposed slot). We surface it as scheduled instead of re-running free/busy
   * — which would count our own event and wrongly report "no free slot" once the meeting is booked.
   */
  alreadyScheduled?: boolean;
  /** Google Calendar event URL (htmlLink) when {@link alreadyScheduled}; null if it couldn't be fetched. */
  eventLink?: string | null;
  /** Google Meet link when {@link alreadyScheduled} and the event has one; null otherwise. */
  meetLink?: string | null;
  /** The calendar events behind an isAvailable: false verdict, so the UI can name the conflict. */
  conflictingEvents?: ConflictingEvent[];
}

const DEFAULT_DURATION_MINUTES = 30;

/**
 * Finds the first free slot of `durationMs` within [windowStart, windowEnd] that doesn't overlap any
 * busy period. Returns the slot start, or null if the window can't fit a free slot of that length.
 */
function findFreeSlot(
  busyPeriods: { start?: string | null; end?: string | null }[],
  windowStart: Date,
  windowEnd: Date,
  durationMs: number,
): Date | null {
  const sorted = busyPeriods
    .map((period) => ({
      start: new Date(period.start ?? "").getTime(),
      end: new Date(period.end ?? "").getTime(),
    }))
    .filter(
      (period) => !Number.isNaN(period.start) && !Number.isNaN(period.end),
    )
    .sort((first, second) => first.start - second.start);

  let candidate = windowStart.getTime();
  const limit = windowEnd.getTime();

  for (const busy of sorted) {
    // Busy period already behind the candidate.
    if (busy.end <= candidate) continue;
    // A gap before this busy period fits the meeting — but only if the slot also fits the window.
    // candidate only grows in later iterations, so if it can't fit the window now, it never will.
    if (busy.start - candidate >= durationMs) {
      if (candidate + durationMs <= limit) {
        return new Date(candidate);
      }
      return null;
    }
    // Otherwise jump past the busy period and keep looking.
    candidate = Math.max(candidate, busy.end);
    if (candidate + durationMs > limit) return null;
  }

  return candidate + durationMs <= limit ? new Date(candidate) : null;
}

async function checkCalendarAvailability(
  service: CalendarService,
  user: {
    id: string;
    googleCalendarAccessToken: string;
    googleCalendarRefreshToken?: string | null;
  },
  proposedTime: string,
  durationMinutes: number | null,
  windowEnd: string | null,
): Promise<{
  isAvailable: boolean | null;
  suggestedTime: string | null;
  conflictingEvents: ConflictingEvent[];
}> {
  try {
    const duration = durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const durationMs = duration * MILLISECONDS.MINUTE;
    const proposedStart = new Date(proposedTime);

    // Any valid range past the proposed start counts as a window. If it's too narrow to fit the
    // meeting, findFreeSlot will return null and we'll report isAvailable: false rather than
    // suggesting a time that would overflow the sender's window.
    const windowEndDate = windowEnd ? new Date(windowEnd) : null;
    const isWindow =
      windowEndDate !== null &&
      !Number.isNaN(windowEndDate.getTime()) &&
      windowEndDate.getTime() > proposedStart.getTime();

    const queryEnd = isWindow
      ? (windowEndDate as Date)
      : new Date(proposedStart.getTime() + durationMs);

    const oauth2Client = service.createOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const freebusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: proposedStart.toISOString(),
        timeMax: queryEnd.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busyPeriods = freebusyResponse.data.calendars?.primary?.busy ?? [];

    if (isWindow) {
      // The sender offered a range — find the first free slot inside it rather
      // than flagging a conflict just because part of the window is busy.
      const slot = findFreeSlot(
        busyPeriods,
        proposedStart,
        queryEnd,
        durationMs,
      );
      return {
        isAvailable: slot !== null,
        suggestedTime: slot ? slot.toISOString() : null,
        conflictingEvents: slot
          ? []
          : await listConflictingEvents(calendar, proposedStart, queryEnd),
      };
    }

    const free = busyPeriods.length === 0;
    return {
      isAvailable: free,
      suggestedTime: free ? proposedStart.toISOString() : null,
      conflictingEvents: free
        ? []
        : await listConflictingEvents(calendar, proposedStart, queryEnd),
    };
  } catch (error) {
    logError(
      "Failed to check calendar availability for proposed meeting time",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { isAvailable: null, suggestedTime: null, conflictingEvents: [] };
  }
}

/** The shape returned by the LLM detector, before calendar availability is layered on. */
type DetectedMeetingProposal = Omit<
  MeetingProposalResult,
  "isAvailable" | "suggestedTime" | "calendarConnected"
>;

/** Zero-pad an hour to two digits for building a naive ISO datetime (e.g. 9 → "09"). */
const HOUR_PAD = 2;

/**
 * Builds the UTC free/busy window to search for a date-only proposal: the recipient's working hours
 * on `proposedDate`, interpreted in their timezone. Clamps the start to `now` when the proposed date
 * is today and part of the working day has already passed. Returns null when the whole working day
 * is already in the past or the times can't be resolved.
 */
function buildAvailabilityWindowForDate(
  proposedDate: string,
  prefs: {
    availabilityStartHour: number;
    availabilityEndHour: number;
    timezone: string;
  },
  now: Date,
): { windowStart: string; windowEnd: string } | null {
  const pad = (hour: number) => String(hour).padStart(HOUR_PAD, "0");
  const startUtc = convertLocalTimeInZoneToUtc(
    `${proposedDate}T${pad(prefs.availabilityStartHour)}:00:00`,
    prefs.timezone,
  );
  const endUtc = convertLocalTimeInZoneToUtc(
    `${proposedDate}T${pad(prefs.availabilityEndHour)}:00:00`,
    prefs.timezone,
  );
  if (!startUtc || !endUtc) return null;

  const endDate = new Date(endUtc);
  // The working day already finished — nothing to suggest on this date.
  if (endDate.getTime() <= now.getTime()) return null;

  const startDate = new Date(startUtc);
  // Never suggest a slot earlier than now (relevant when the proposed date is today).
  const windowStart = startDate.getTime() < now.getTime() ? now : startDate;
  if (windowStart.getTime() >= endDate.getTime()) return null;

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: endDate.toISOString(),
  };
}

/**
 * Resolves a date-only proposal (sender named a day but no time) into a concrete suggestion by
 * searching the recipient's working hours on that date for the first free slot. The free slot is
 * surfaced as `proposedTime` so the client renders the invite card pre-filled, with the working-hours
 * window driving the "free at HH:MM" availability line. When no free slot exists (or the day is in
 * the past) we degrade to `hasProposal: false` so the generic scheduling actions render instead.
 */
async function resolveDateOnlyProposal(
  service: CalendarService,
  user: Parameters<typeof checkCalendarAvailability>[1],
  proposal: DetectedMeetingProposal,
  prefs: {
    availabilityStartHour: number;
    availabilityEndHour: number;
    timezone: string;
  },
): Promise<MeetingProposalResult> {
  const degraded: MeetingProposalResult = {
    ...proposal,
    hasProposal: false,
    proposedTime: null,
    windowEnd: null,
    isAvailable: null,
    suggestedTime: null,
    calendarConnected: true,
  };

  const window = proposal.proposedDate
    ? buildAvailabilityWindowForDate(proposal.proposedDate, prefs, new Date())
    : null;
  if (!window) {
    return degraded;
  }

  const { isAvailable, suggestedTime, conflictingEvents } =
    await checkCalendarAvailability(
      service,
      user,
      window.windowStart,
      proposal.durationMinutes,
      window.windowEnd,
    );

  if (!suggestedTime) {
    // No free slot in working hours that day — let the user draft a reply / share their link.
    return { ...degraded, isAvailable, conflictingEvents };
  }

  return {
    ...proposal,
    proposedTime: suggestedTime,
    windowEnd: window.windowEnd,
    isAvailable: true,
    suggestedTime,
    calendarConnected: true,
  };
}

/** How many earlier thread messages to feed the detector as confirmation-reply context. */
const MAX_PRIOR_THREAD_MESSAGES = 4;

/**
 * Returns the messages that came BEFORE the viewed email in its thread, oldest first,
 * capped to the most recent {@link MAX_PRIOR_THREAD_MESSAGES}. These give the detector
 * the original proposal so a short confirmation reply can inherit its day/date.
 */
async function getPriorThreadMessages(
  service: CalendarService,
  userId: string,
  viewedEmail: { id: string; threadId?: string | null },
): Promise<Array<{ from: string; fromName?: string; body: string }>> {
  if (!viewedEmail.threadId) {
    return [];
  }
  try {
    const threadEmails = await service.emailsService.getThreadEmails(
      userId,
      viewedEmail.threadId,
      { order: "ASC" },
    );
    const viewedIndex = threadEmails.findIndex(
      (threadEmail) => threadEmail.id === viewedEmail.id,
    );
    const priorEmails =
      viewedIndex !== -1 ? threadEmails.slice(0, viewedIndex) : threadEmails;
    return priorEmails
      .filter(
        (threadEmail) =>
          threadEmail.id !== viewedEmail.id &&
          Boolean(threadEmail.body || threadEmail.htmlBody),
      )
      .slice(-MAX_PRIOR_THREAD_MESSAGES)
      .map((threadEmail) => ({
        from: threadEmail.from,
        fromName: threadEmail.fromName,
        body: threadEmail.body || threadEmail.htmlBody || "",
      }));
  } catch (error) {
    proposalLog.warn(
      `[getPriorThreadMessages] failed to load thread context for email ${viewedEmail.id}`,
      error,
    );
    return [];
  }
}

/**
 * Detects whether the email proposes a specific meeting time and checks calendar availability.
 *
 * Detection always runs on the specific email the user is viewing (the one that triggered the
 * scheduling panel) via the dedicated, timezone-aware `detectMeetingProposal` prompt. Earlier
 * thread messages are passed as context only, so a short confirmation reply ("lock in 2pm") can
 * inherit the day/date from the original proposal. We do NOT fall back to the thread's most
 * recent email or the cached EmailThread.meetingProposal: the cache is produced by the
 * summarisation prompt, which lacks the timezone-offset rules, and keying off the most recent
 * email caused the "Create Calendar Invite" button to disappear when a later reply in the thread
 * didn't restate the proposed time.
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

  const prefs =
    await service.schedulingPreferencesService.getPreferences(userId);

  // Gather earlier messages in the thread so a short confirmation reply
  // ("great, lock in 2pm") can inherit the day/date from the original
  // proposal — the viewed email alone often only restates the time.
  const priorMessages = await getPriorThreadMessages(service, userId, email);

  proposalLog.debug(
    `[checkMeetingProposal] running timezone-aware detect on viewed email ${emailId} with userTimezone="${prefs.timezone}" priorMessages=${priorMessages.length}`,
  );
  const proposal = await service.llmService.detectMeetingProposal(
    {
      from: email.from,
      fromName: email.fromName,
      subject: email.subject || "",
      body: email.body || email.htmlBody || "",
      priorMessages,
    },
    undefined,
    userId,
    prefs.timezone,
  );

  // Nothing actionable: neither an explicit time/window nor a bare date the sender pinned down.
  if (
    !proposal.hasProposal ||
    (!proposal.proposedTime && !proposal.proposedDate)
  ) {
    return {
      ...proposal,
      isAvailable: null,
      suggestedTime: null,
      calendarConnected: false,
    };
  }

  const user = await service.usersService.findOne(userId);
  if (!user?.googleCalendarAccessToken) {
    // A date-only proposal needs calendar access to suggest a time; without it there's nothing
    // concrete to show, so degrade to "no proposal" and let the generic scheduling actions render.
    if (!proposal.proposedTime) {
      return {
        ...proposal,
        hasProposal: false,
        proposedTime: null,
        windowEnd: null,
        isAvailable: null,
        suggestedTime: null,
        calendarConnected: false,
      };
    }
    return {
      ...proposal,
      isAvailable: null,
      suggestedTime: null,
      calendarConnected: false,
    };
  }

  // Date-only proposal: search the recipient's working hours on that date for a free slot.
  if (!proposal.proposedTime) {
    return resolveDateOnlyProposal(service, user, proposal, prefs);
  }

  // If the user already created an event for this proposal, surface it as scheduled rather than
  // re-running free/busy — otherwise our own event shows up as a conflict and the card wrongly warns
  // "no free slot" for a meeting that's already booked (#2540).
  const existingEvent = await findExistingScheduledEvent(service, user, {
    senderEmail: email.from,
    proposedTime: proposal.proposedTime,
    durationMinutes: proposal.durationMinutes,
    windowEnd: proposal.windowEnd ?? null,
  });
  if (existingEvent) {
    return {
      ...proposal,
      windowEnd: proposal.windowEnd ?? null,
      isAvailable: true,
      suggestedTime: proposal.proposedTime,
      calendarConnected: true,
      alreadyScheduled: true,
      eventLink: existingEvent.eventLink,
      meetLink: existingEvent.meetLink,
    };
  }

  // Explicit time or window the sender proposed — check that exact slot/window.
  const { isAvailable, suggestedTime, conflictingEvents } =
    await checkCalendarAvailability(
      service,
      user,
      proposal.proposedTime,
      proposal.durationMinutes,
      proposal.windowEnd ?? null,
    );
  return {
    ...proposal,
    windowEnd: proposal.windowEnd ?? null,
    isAvailable,
    suggestedTime,
    calendarConnected: true,
    conflictingEvents,
  };
}

/**
 * Re-checks calendar availability for an exact, user-chosen time and duration.
 *
 * Used when the user edits the date/time/duration in the scheduling panel before creating the
 * invite: the original {@link checkMeetingProposal} verdict is for the *proposed* slot, so once
 * the user picks a different time we must re-query free/busy for that exact slot. windowEnd is
 * always null here — a manual edit is a fixed start, not a range to search within.
 */
export async function checkTimeAvailability(
  service: CalendarService,
  userId: string,
  proposedTime: string,
  durationMinutes: number | null,
): Promise<{
  isAvailable: boolean | null;
  suggestedTime: string | null;
  calendarConnected: boolean;
  conflictingEvents: ConflictingEvent[];
}> {
  const user = await service.usersService.findOne(userId);
  if (!user?.googleCalendarAccessToken) {
    return {
      isAvailable: null,
      suggestedTime: null,
      calendarConnected: false,
      conflictingEvents: [],
    };
  }

  const { isAvailable, suggestedTime, conflictingEvents } =
    await checkCalendarAvailability(
      service,
      user,
      proposedTime,
      durationMinutes,
      null,
    );
  return {
    isAvailable,
    suggestedTime,
    calendarConnected: true,
    conflictingEvents,
  };
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
