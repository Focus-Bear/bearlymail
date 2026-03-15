import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";
import * as ical from "node-ical";
import { Repository } from "typeorm";

import {
  IcsAttendee,
  IcsEventData,
  IcsInfoResponse,
} from "./ics-event.types";

import {
  HOURS,
  MILLISECONDS,
  MINUTES,
  MINUTES_PER_HOUR,
} from "../constants/time-constants";
import { CalendarBooking } from "../database/entities/calendar-booking.entity";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import {
  SchedulingPreferenceData,
  SchedulingPreferencesService,
} from "../scheduling-preferences/scheduling-preferences.service";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import {
  generateMeetingReply,
  respondToInvitation,
} from "./calendar-invitation-response.service";

const BOOKING_TOKEN_BYTES = 32;
const MEET_REQUEST_ID_BYTES = 8;

export interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

export interface TimeSlotsWithTimezone {
  slots: TimeSlot[];
  timezone: string;
  hasMore: boolean;
}

interface BusyPeriod {
  start: string;
  end: string;
}

@Injectable()
export class CalendarService {
  public readonly logger = new Logger(CalendarService.name);
  public oauth2Client: OAuth2Client;

  constructor(
    public usersService: UsersService,
    public llmService: LLMService,
    public emailsService: EmailsService,
    public schedulingPreferencesService: SchedulingPreferencesService,
    @InjectRepository(CalendarBooking)
    public calendarBookingRepository: Repository<CalendarBooking>,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3001/auth/google/callback",
    );
  }

  async getAvailableTimeSlots(
    userId: string,
    daysAhead: number = 7,
    prefsOverride?: SchedulingPreferenceData,
    options?: { limit?: number; afterDate?: Date },
  ): Promise<TimeSlot[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });
    // Start from afterDate if provided (for "load more" pagination), otherwise now
    const startDate = options?.afterDate
      ? new Date(options.afterDate)
      : new Date();
    const endDate = new Date(
      startDate.getTime() + daysAhead * MILLISECONDS.DAY,
    );

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: "primary" }],
        },
      });

      // Find free slots — stop early once `limit` slots are found
      const busy = (response.data.calendars?.primary?.busy || []).filter(
        (period): period is BusyPeriod =>
          period.start !== undefined && period.end !== undefined,
      ) as BusyPeriod[];
      const prefs =
        prefsOverride ||
        (await this.schedulingPreferencesService.getPreferences(userId));

      const freeSlots = this.calculateFreeSlots(
        startDate,
        endDate,
        busy,
        prefs,
        options?.limit,
      );

      return freeSlots;
    } catch (error) {
      logError(
        "Error fetching calendar",
        error instanceof Error ? error : new Error(String(error)),
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Insufficient Permission") ||
        errorMessage.includes("insufficientPermissions") ||
        errorMessage.includes("PERMISSION_DENIED")
      ) {
        throw new Error("Google Calendar access not authorized");
      }
      throw new Error("Failed to fetch calendar data");
    }
  }

  async getAvailableSlotsWithTimezone(
    userId: string,
    daysAhead: number = 7,
    _offset: number = 0,
    limit: number = 8,
    afterDate?: Date,
  ): Promise<TimeSlotsWithTimezone> {
    const prefs =
      await this.schedulingPreferencesService.getPreferences(userId);
    // Pass limit+1 to detect hasMore without fetching unlimited slots
    const slots = await this.getAvailableTimeSlots(userId, daysAhead, prefs, {
      limit: limit + 1,
      afterDate,
    });
    const hasMore = slots.length > limit;
    const paginatedSlots = slots.slice(0, limit);
    return {
      slots: paginatedSlots,
      timezone: prefs.timezone || "UTC",
      hasMore,
    };
  }

  private toTzDate(date: Date, tz: string): Date {
    // Get the time in the target timezone as a formatted string
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const dateMap: Record<string, string> = {};
    parts.forEach((part) => {
      if (part.type !== "literal") {
        dateMap[part.type] = part.value;
      }
    });

    // Create a Date object using the timezone-specific values
    // This represents the same wall-clock time in the target timezone
    return new Date(
      Number(dateMap.year),
      Number(dateMap.month) - 1,
      Number(dateMap.day),
      Number(dateMap.hour),
      Number(dateMap.minute),
      Number(dateMap.second),
    );
  }

  private toDayKey(date: Date, tz: string): string {
    const tzDate = this.toTzDate(date, tz);
    const year = tzDate.getFullYear();
    const month = String(tzDate.getMonth() + 1).padStart(2, "0");
    const day = String(tzDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private alignToSlotBoundary(date: Date, slotDurationMinutes: number): Date {
    const aligned = new Date(date);
    const minutes = aligned.getMinutes();
    const remainder = minutes % slotDurationMinutes;
    if (remainder !== 0) {
      aligned.setMinutes(minutes + (slotDurationMinutes - remainder));
      aligned.setSeconds(0, 0);
    } else {
      aligned.setSeconds(0, 0);
    }
    return aligned;
  }

  private calculateFreeSlots(
    start: Date,
    end: Date,
    busy: BusyPeriod[],
    prefs?: SchedulingPreferenceData,
    limit?: number,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const slotDuration = prefs?.slotDurationMinutes || MINUTES.THIRTY;
    const startHour = prefs?.availabilityStartHour ?? HOURS.NINE;
    const endHour = prefs?.availabilityEndHour ?? HOURS.SEVENTEEN;
    const availDays = prefs?.availabilityDays ?? [1, 2, 3, 4, 5];
    const gapMinutes = prefs?.meetingGapMinutes ?? MINUTES.THIRTY;
    const deepWorkHours = prefs?.deepWorkHoursPerDay ?? 2;
    const tz = prefs?.timezone || "UTC";
    let current = this.alignToSlotBoundary(start, slotDuration);

    const meetingMinutesPerDay = new Map<string, number>();

    while (current < end) {
      const slotEnd = new Date(
        current.getTime() + slotDuration * MILLISECONDS.MINUTE,
      );
      const tzDate = this.toTzDate(current, tz);
      const dayKey = this.toDayKey(current, tz);
      const dayOfWeek = tzDate.getDay();
      const hourInTz = tzDate.getHours();

      if (!availDays.includes(dayOfWeek)) {
        current = new Date(
          current.getTime() + slotDuration * MILLISECONDS.MINUTE,
        );
        continue;
      }

      if (hourInTz < startHour || hourInTz >= endHour) {
        current = new Date(
          current.getTime() + slotDuration * MILLISECONDS.MINUTE,
        );
        continue;
      }

      const isBusy = busy.some((itemB) => {
        const busyStart = new Date(itemB.start);
        const busyEnd = new Date(itemB.end);
        return (
          (current >= busyStart && current < busyEnd) ||
          (slotEnd > busyStart && slotEnd <= busyEnd) ||
          (current <= busyStart && slotEnd >= busyEnd)
        );
      });

      if (isBusy) {
        current = new Date(
          current.getTime() + slotDuration * MILLISECONDS.MINUTE,
        );
        continue;
      }

      const isTooCloseToMeeting = busy.some((itemB) => {
        const busyEnd = new Date(itemB.end);
        const busyStart = new Date(itemB.start);
        const gapMs = gapMinutes * MILLISECONDS.MINUTE;
        const tooCloseAfter =
          current.getTime() >= busyEnd.getTime() &&
          current.getTime() < busyEnd.getTime() + gapMs;
        const tooCloseBefore =
          slotEnd.getTime() <= busyStart.getTime() &&
          slotEnd.getTime() > busyStart.getTime() - gapMs;
        return tooCloseAfter || tooCloseBefore;
      });

      if (isTooCloseToMeeting) {
        current = new Date(
          current.getTime() + slotDuration * MILLISECONDS.MINUTE,
        );
        continue;
      }

      const totalAvailMinutes = (endHour - startHour) * MINUTES_PER_HOUR;
      const existingMeetingMinutes = this.getMeetingMinutesForDay(
        dayKey,
        busy,
        startHour,
        endHour,
        tz,
      );
      const bookedSlotMinutes = meetingMinutesPerDay.get(dayKey) || 0;
      const totalBooked = existingMeetingMinutes + bookedSlotMinutes;
      const deepWorkMinutes = deepWorkHours * MINUTES_PER_HOUR;
      const maxBookableMinutes = totalAvailMinutes - deepWorkMinutes;

      if (totalBooked + slotDuration > maxBookableMinutes) {
        current = new Date(
          current.getTime() + slotDuration * MILLISECONDS.MINUTE,
        );
        continue;
      }

      // Slot is available!
      slots.push({
        start: current.toISOString(),
        end: slotEnd.toISOString(),
        duration: slotDuration,
      });
      meetingMinutesPerDay.set(dayKey, bookedSlotMinutes + slotDuration);

      // Early exit when we have enough slots — avoids scanning the full window
      if (limit !== undefined && slots.length >= limit) {
        break;
      }

      current = new Date(
        current.getTime() + slotDuration * MILLISECONDS.MINUTE,
      );
    }

    return slots;
  }

  private getMeetingMinutesForDay(
    dayKey: string,
    busy: BusyPeriod[],
    startHour: number,
    endHour: number,
    tz: string,
  ): number {
    let total = 0;
    for (const itemB of busy) {
      const busyStart = new Date(itemB.start);
      const busyEnd = new Date(itemB.end);
      if (this.toDayKey(busyStart, tz) !== dayKey) continue;
      const tzStart = this.toTzDate(busyStart, tz);
      const dayStart = new Date(tzStart);
      dayStart.setHours(startHour, 0, 0, 0);
      const dayEnd = new Date(tzStart);
      dayEnd.setHours(endHour, 0, 0, 0);
      const effectiveStart = tzStart < dayStart ? dayStart : tzStart;
      const effectiveEnd =
        this.toTzDate(busyEnd, tz) > dayEnd
          ? dayEnd
          : this.toTzDate(busyEnd, tz);
      if (effectiveEnd > effectiveStart) {
        total +=
          (effectiveEnd.getTime() - effectiveStart.getTime()) /
          MILLISECONDS.MINUTE;
      }
    }
    return total;
  }

  async createEvent(
    userId: string,
    startTime: string,
    durationMinutes: number,
    guestEmail: string,
    guestName?: string,
    title?: string,
    description?: string,
  ): Promise<calendar_v3.Schema$Event & { meetLink: string | null }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });
    const start = new Date(startTime);
    const end = new Date(
      start.getTime() + durationMinutes * MILLISECONDS.MINUTE,
    );

    // Generate booking token for reschedule/cancel links
    const bookingToken = this.generateBookingToken();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const rescheduleUrl = `${frontendUrl}/booking/${bookingToken}/reschedule`;
    const cancelUrl = `${frontendUrl}/booking/${bookingToken}/cancel`;

    // Add reschedule/cancel links to description
    const enhancedDescription = `${description || "Scheduled via BearlyMail"}

---
Manage this booking:
• Reschedule: ${rescheduleUrl}
• Cancel: ${cancelUrl}`;

    try {
      // Generate a unique requestId for the Meet link creation.
      // Google requires this to be idempotent (same requestId = same Meet link).
      const meetRequestId = randomBytes(MEET_REQUEST_ID_BYTES).toString("hex");

      const event = await calendar.events.insert({
        calendarId: "primary",
        // conferenceDataVersion: 1 is required for Google Meet to be auto-created
        conferenceDataVersion: 1,
        requestBody: {
          summary: title || `Meeting with ${guestName || guestEmail}`,
          description: enhancedDescription,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: [{ email: guestEmail }],
          conferenceData: {
            createRequest: {
              requestId: meetRequestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        },
      });

      // Save booking record to database
      if (event.data.id) {
        await this.calendarBookingRepository.save({
          userId,
          bookingToken,
          googleEventId: event.data.id,
          guestEmail,
          guestName: guestName || null,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          durationMinutes,
          title: title || null,
          description: description || null,
          status: "active",
        });
      }

      // Extract the Google Meet link from conferenceData entryPoints if present
      const meetEntryPoint = event.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video",
      );
      const meetLink = meetEntryPoint?.uri ?? null;

      return { ...event.data, meetLink };
    } catch (error) {
      logError(
        "Error creating calendar event",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to create calendar event");
    }
  }

  private generateBookingToken(): string {
    return randomBytes(BOOKING_TOKEN_BYTES).toString("hex");
  }

  async getBookingByToken(bookingToken: string): Promise<CalendarBooking> {
    const booking = await this.calendarBookingRepository.findOne({
      where: { bookingToken },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    return booking;
  }

  async rescheduleBooking(
    bookingToken: string,
    newStartTime: string,
  ): Promise<calendar_v3.Schema$Event> {
    const booking = await this.getBookingByToken(bookingToken);

    if (booking.status === "cancelled") {
      throw new Error("Cannot reschedule a cancelled booking");
    }

    const user = await this.usersService.findOne(booking.userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });

    const newStart = new Date(newStartTime);
    const newEnd = new Date(
      newStart.getTime() + booking.durationMinutes * MILLISECONDS.MINUTE,
    );

    try {
      const event = await calendar.events.patch({
        calendarId: "primary",
        eventId: booking.googleEventId,
        requestBody: {
          start: { dateTime: newStart.toISOString() },
          end: { dateTime: newEnd.toISOString() },
        },
      });

      // Update booking record
      booking.startTime = newStart.toISOString();
      booking.endTime = newEnd.toISOString();
      booking.status = "rescheduled";
      await this.calendarBookingRepository.save(booking);

      return event.data;
    } catch (error) {
      logError(
        "Error rescheduling calendar event",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to reschedule calendar event");
    }
  }

  async cancelBooking(
    bookingToken: string,
  ): Promise<{ success: boolean; message: string }> {
    const booking = await this.getBookingByToken(bookingToken);

    if (booking.status === "cancelled") {
      throw new Error("Booking is already cancelled");
    }

    const user = await this.usersService.findOne(booking.userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });

    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: booking.googleEventId,
      });

      // Update booking status
      booking.status = "cancelled";
      await this.calendarBookingRepository.save(booking);

      return {
        success: true,
        message: "Booking cancelled successfully",
      };
    } catch (error) {
      logError(
        "Error cancelling calendar event",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to cancel calendar event");
    }
  }

  async findEventsWithAttendee(
    userId: string,
    attendeeEmail: string,
    daysAhead: number = 90,
    daysBack: number = 30,
  ): Promise<
    Array<{
      id: string | null | undefined;
      summary: string | null | undefined;
      description: string | null | undefined;
      start: string | null | undefined;
      end: string | null | undefined;
      attendees?: Array<{
        email: string | null | undefined;
        displayName: string | null | undefined;
        responseStatus: string | null | undefined;
      }>;
      htmlLink: string | null | undefined;
      location: string | null | undefined;
    }>
  > {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });

    const now = new Date();
    const timeMin = new Date(now.getTime() - daysBack * MILLISECONDS.DAY);
    const timeMax = new Date(now.getTime() + daysAhead * MILLISECONDS.DAY);

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (response.data.items || []).filter((event) => {
        // Check if the attendee email is in the attendees list
        if (event.attendees) {
          return event.attendees.some(
            (attendee) =>
              attendee.email?.toLowerCase() === attendeeEmail.toLowerCase(),
          );
        }
        return false;
      });

      return events.map((event) => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        attendees: event.attendees?.map((itemA) => ({
          email: itemA.email,
          displayName: itemA.displayName,
          responseStatus: itemA.responseStatus,
        })),
        htmlLink: event.htmlLink,
        location: event.location,
      }));
    } catch (error) {
      logError(
        "Error finding calendar events",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to find calendar events");
    }
  }

  /**
   * Detect if an email is a calendar invitation
   * Uses strict criteria to avoid false positives
   */
  isCalendarInvitation(email: {
    subject?: string;
    body?: string;
    htmlBody?: string;
  }): boolean {
    const subject = (email.subject || "").toLowerCase();
    const body = (email.body || "").toLowerCase();
    const htmlBody = (email.htmlBody || "").toLowerCase();
    const combinedText = `${subject} ${body} ${htmlBody}`;

    // Check subject for specific invitation keywords (more strict)
    const invitationKeywords = [
      // Most common format
      "invitation:",
      // Alternative format
      "invite:",
      "meeting invitation",
      "event invitation",
      "calendar invitation",
      "you're invited to",
      "you are invited to",
      "meeting request",
      "event request",
    ];

    const hasInvitationKeyword = invitationKeywords.some((keyword) =>
      subject.includes(keyword),
    );

    // Check for iCal content patterns (most reliable indicator)
    const hasICalPattern =
      combinedText.includes("begin:vcalendar") ||
      combinedText.includes("method:request") ||
      combinedText.includes("content-type:text/calendar") ||
      combinedText.includes("content-type: text/calendar") ||
      (combinedText.includes('attachment; filename="') &&
        combinedText.includes(".ics"));

    // Check for iCal-specific headers (strict patterns)
    const hasICalHeaders =
      combinedText.includes("dtstart:") ||
      combinedText.includes("dtend:") ||
      combinedText.includes("organizer:mailto:") ||
      combinedText.includes("attendee:mailto:") ||
      (combinedText.includes("uid:") && combinedText.includes("@"));

    // Only return true if we have strong indicators
    // Require either invitation keyword in subject OR iCal patterns
    return hasInvitationKeyword || hasICalPattern || hasICalHeaders;
  }

  /**
   * Respond to a calendar invitation
   */
  async respondToInvitation(
    userId: string,
    emailId: string,
    response: "accepted" | "declined" | "tentative",
  ): Promise<void> {
    return respondToInvitation(this, userId, emailId, response);
  }

  async generateMeetingReply(
    userId: string,
    emailId: string,
    provider?: "gemini" | "openai",
  ): Promise<string> {
    return generateMeetingReply(this, userId, emailId, provider);
  }

  // ---------------------------------------------------------------------------
  // ICS attachment support
  // ---------------------------------------------------------------------------

  /**
   * Fetch an ICS attachment via the emails service, parse the first VEVENT,
   * and return a structured IcsEventData object.
   */
  async parseIcsAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsEventData> {
    const { attachmentBuffer } =
      await this.emailsService.getAttachment(userId, emailId, attachmentId);

    const icsString = attachmentBuffer.toString("utf-8");
    const parsed = ical.sync.parseICS(icsString);

    // Find the first VEVENT component
    const eventEntry = Object.values(parsed).find(
      (entry) => entry.type === "VEVENT",
    ) as ical.VEvent | undefined;

    if (!eventEntry) {
      throw new Error("No VEVENT found in ICS attachment");
    }

    const startDate: Date | undefined =
      eventEntry.start instanceof Date
        ? eventEntry.start
        : undefined;
    const endDate: Date | undefined =
      eventEntry.end instanceof Date ? eventEntry.end : undefined;

    if (!startDate) {
      throw new Error("ICS VEVENT has no valid DTSTART");
    }

    /**
     * node-ical VEvent does not declare all properties in its type definition.
     * We intersect extra types here to avoid `as any` casts throughout the parser.
     * (We do NOT extend VEvent to avoid TS2430 property type conflicts.)
     */
    interface IcsVEventExtra {
      /** "date" for all-day events, "date-time" for timed events */
      datetype?: string;
      /** Raw attendee value(s) — single object or array */
      attendee?: IcsRawAttendee | IcsRawAttendee[];
      /** RRULE recurrence rule object */
      rrule?: unknown;
    }
    interface IcsRawParamBag {
      CN?: string;
      PARTSTAT?: string;
      // node-ical Attendee.params uses string | number | boolean in the index signature
      [key: string]: string | number | boolean | undefined;
    }
    interface IcsRawAttendee {
      val: string;
      params?: IcsRawParamBag;
    }
    interface IcsRawOrganizer {
      val?: string;
      params?: IcsRawParamBag;
    }

    const extEntry = eventEntry as ical.VEvent & IcsVEventExtra;

    // Determine all-day: node-ical sets `datetype` to 'date' for all-day events
    const allDay = extEntry.datetype === "date";

    // Parse organizer
    let organizer: IcsEventData["organizer"] | undefined;
    if (extEntry.organizer) {
      const org = extEntry.organizer as unknown as string | IcsRawOrganizer;
      const raw: string = typeof org === "string" ? org : (org.val ?? "");
      const email = raw.replace(/^mailto:/i, "").trim();
      const rawCn = typeof org === "object" ? org.params?.CN : undefined;
      const cn: string | undefined =
        typeof rawCn === "string" ? rawCn : undefined;
      organizer = { email, name: cn };
    }

    // Parse attendees
    const attendees: IcsAttendee[] = [];
    const rawAttendees = extEntry.attendee;
    let attendeeList: (string | IcsRawAttendee)[];
    if (!rawAttendees) {
      attendeeList = [];
    } else if (Array.isArray(rawAttendees)) {
      attendeeList = rawAttendees;
    } else {
      attendeeList = [rawAttendees];
    }
    for (const att of attendeeList) {
      const rawVal: string =
        typeof att === "string" ? att : (att.val ?? "");
      const email = rawVal.replace(/^mailto:/i, "").trim();
      if (!email) continue;
      const params: IcsRawParamBag =
        typeof att === "object" ? (att.params ?? {}) : {};
      attendees.push({
        email,
        name: typeof params.CN === "string" ? params.CN : undefined,
        status: typeof params.PARTSTAT === "string" ? params.PARTSTAT : undefined,
      });
    }

    // Detect RRULE (recurring events)
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
      location: typeof extEntry.location === "string" ? extEntry.location : undefined,
      description: typeof extEntry.description === "string" ? extEntry.description : undefined,
      organizer,
      attendees,
      timezone,
      isRecurring,
    };
  }

  /**
   * Check whether a user's Google Calendar already contains an event matching
   * the given ICS event (by title + start time proximity ±5 minutes).
   * Returns { exists: false } if the user hasn't connected Google Calendar.
   */
  async checkEventExists(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{ exists: boolean; calendarEventId?: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      return { exists: false };
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
    const startMs = new Date(eventData.startAt).getTime();
    const FIVE_MINUTES_MS = MINUTES.FIVE * MILLISECONDS.MINUTE;

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date(startMs - FIVE_MINUTES_MS).toISOString(),
        timeMax: new Date(startMs + FIVE_MINUTES_MS).toISOString(),
        q: eventData.title,
        singleEvents: true,
      });

      const match = (response.data.items ?? []).find((ev) => {
        const evStart = ev.start?.dateTime ?? ev.start?.date;
        if (!evStart) return false;
        const diff = Math.abs(new Date(evStart).getTime() - startMs);
        return diff <= FIVE_MINUTES_MS;
      });

      if (match) {
        return { exists: true, calendarEventId: match.id ?? undefined };
      }
      return { exists: false };
    } catch {
      // If we can't check, assume not exists (add button will surface any error)
      return { exists: false };
    }
  }

  /**
   * Add a parsed ICS event to the user's primary Google Calendar.
   * Returns { success, eventLink }.
   */
  async addIcsEventToCalendar(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{ success: boolean; eventLink?: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Google Calendar not connected");
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

    const eventBody: calendar_v3.Schema$Event = {
      summary: eventData.title,
      location: eventData.location,
      description: eventData.description,
      start: eventData.allDay
        ? { date: eventData.startAt.slice(0, 10) }
        : { dateTime: eventData.startAt, timeZone: eventData.timezone ?? "UTC" },
      end: eventData.allDay
        ? { date: (eventData.endAt ?? eventData.startAt).slice(0, 10) }
        : {
            dateTime: eventData.endAt ?? eventData.startAt,
            timeZone: eventData.timezone ?? "UTC",
          },
      attendees: eventData.attendees.map((att) => ({
        email: att.email,
        displayName: att.name,
        responseStatus: this.mapAttendeeStatus(att.status),
      })),
    };

    const created = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventBody,
    });

    return {
      success: true,
      eventLink: created.data.htmlLink ?? undefined,
    };
  }

  /**
   * Full flow: parse ICS attachment and check if the event already exists in
   * Google Calendar. Returns structured IcsInfoResponse for the frontend.
   */
  async getIcsInfo(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsInfoResponse> {
    const event = await this.parseIcsAttachment(userId, emailId, attachmentId);
    const { exists, calendarEventId } = await this.checkEventExists(userId, event);
    return { event, alreadyInCalendar: exists, calendarEventId };
  }

  /** Map ICS PARTSTAT to Google Calendar responseStatus */
  private mapAttendeeStatus(
    partstat?: string,
  ): "accepted" | "declined" | "tentative" | "needsAction" {
    switch ((partstat ?? "").toUpperCase()) {
      case "ACCEPTED":
        return "accepted";
      case "DECLINED":
        return "declined";
      case "TENTATIVE":
        return "tentative";
      default:
        return "needsAction";
    }
  }
}
