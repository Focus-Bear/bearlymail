import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";
import { Repository } from "typeorm";

import { createUserGoogleOAuthClient } from "../auth/google-oauth-client";
import {
  BOOKING_STATUS,
  CALENDAR_ENTRY_POINT_TYPES,
} from "../constants/domain-statuses";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS } from "../constants/time-constants";
import { CalendarBooking } from "../database/entities/calendar-booking.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "../emails/emails.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { LLMService } from "../llm/llm.service";
import {
  SchedulingPreferenceData,
  SchedulingPreferencesService,
} from "../scheduling-preferences/scheduling-preferences.service";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { BookingNotificationService } from "./booking-notification.service";
import {
  BookSlotOptions,
  CalendarAgendaService,
  CreateEventOptions,
} from "./calendar-agenda.service";
import { BusyPeriod, calculateFreeSlots } from "./calendar-free-slots.helper";
import { CalendarIcsService } from "./calendar-ics.service";
import {
  checkMeetingProposal,
  checkTimeAvailability,
  ConflictingEvent,
  generateMeetingReply,
  MeetingProposalResult,
  respondToInvitation,
  rsvpByEventId,
} from "./calendar-invitation-response.service";
import { IcsEventData, IcsInfoResponse } from "./ics-event.types";

const BOOKING_TOKEN_BYTES = 32;
const MEET_REQUEST_ID_BYTES = 8;
const _HTTP_NOT_FOUND = 404;

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

@Injectable()
export class CalendarService {
  public readonly logger = new Logger(CalendarService.name);

  constructor(
    public usersService: UsersService,
    public googleAccountsService: GoogleAccountsService,
    public llmService: LLMService,
    public emailsService: EmailsService,
    public schedulingPreferencesService: SchedulingPreferencesService,
    @InjectRepository(CalendarBooking)
    public calendarBookingRepository: Repository<CalendarBooking>,
    @InjectRepository(EmailThread)
    public emailThreadRepository: Repository<EmailThread>,
    public calendarAgendaService: CalendarAgendaService,
    public calendarIcsService: CalendarIcsService,
    public bookingNotificationService: BookingNotificationService,
  ) {}

  /**
   * Create a fresh per-request OAuth2Client for a given user's credentials.
   * This avoids the shared-singleton race where concurrent requests overwrite
   * each other's tokens on a single shared client.
   */
  createOAuth2Client(user: {
    id: string;
    googleCalendarAccessToken: string;
    googleCalendarRefreshToken?: string | null;
  }): OAuth2Client {
    return createUserGoogleOAuthClient(
      this.usersService,
      user.id,
      user.googleCalendarAccessToken,
      user.googleCalendarRefreshToken,
      {
        redirectUri:
          process.env.GOOGLE_REDIRECT_URI ||
          "http://localhost:3001/auth/google/callback",
      },
    );
  }

  /**
   * Public booking URLs use `/book/:id` where `id` should be `users.id`. Some clients
   * accidentally used `google_accounts.id` (also a UUID). Resolve either to `users.id`.
   */
  async resolvePublicBookingHostUserId(rawId: string): Promise<string> {
    if (await this.usersService.hasUser(rawId)) {
      return rawId;
    }
    const viaGoogleAccount =
      await this.googleAccountsService.findOwnerUserIdByGoogleAccountId(rawId);
    if (viaGoogleAccount) {
      return viaGoogleAccount;
    }
    throw new Error("User not found");
  }

  /** True when the signed-in user is the host for this public booking URL param. */
  async isSameBookingHost(
    sessionUserId: string,
    urlParamId: string,
  ): Promise<boolean> {
    if (sessionUserId === urlParamId) {
      return true;
    }
    try {
      const resolved = await this.resolvePublicBookingHostUserId(urlParamId);
      return resolved === sessionUserId;
    } catch {
      return false;
    }
  }

  async getAvailableTimeSlots(
    userId: string,
    daysAhead: number = 7,
    prefsOverride?: SchedulingPreferenceData,
    options?: { limit?: number; afterDate?: Date },
  ): Promise<TimeSlot[]> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.googleCalendarAccessToken) {
      throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
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

      const freeSlots = calculateFreeSlots(
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
      if (this.isTokenExpiredError(error)) {
        await this.usersService.update(userId, { needsRelogin: true });
        throw new Error(
          "Google Calendar access has expired. The calendar owner needs to reconnect their Google account.",
        );
      }
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
    const resolvedUserId = await this.resolvePublicBookingHostUserId(userId);
    const prefs =
      await this.schedulingPreferencesService.getPreferences(resolvedUserId);
    // Pass limit+1 to detect hasMore without fetching unlimited slots
    const slots = await this.getAvailableTimeSlots(
      resolvedUserId,
      daysAhead,
      prefs,
      {
        limit: limit + 1,
        afterDate,
      },
    );
    const hasMore = slots.length > limit;
    const paginatedSlots = slots.slice(0, limit);
    return {
      slots: paginatedSlots,
      timezone: prefs.timezone || "UTC",
      hasMore,
    };
  }

  async createEvent(options: {
    userId: string;
    startTime: string;
    durationMinutes: number;
    guestEmail: string;
    guestName?: string;
    title?: string;
    description?: string;
    additionalGuests?: string[];
  }): Promise<calendar_v3.Schema$Event & { meetLink: string | null }> {
    const {
      userId,
      startTime,
      durationMinutes,
      guestEmail,
      guestName,
      title,
      description,
      additionalGuests = [],
    } = options;
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });
    const start = new Date(startTime);
    const end = new Date(
      start.getTime() + durationMinutes * MILLISECONDS.MINUTE,
    );

    // Generate booking token for reschedule/cancel links
    const bookingToken = this.generateBookingToken();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const bookingBase = frontendUrl.replace(/\/$/, "");
    const rescheduleUrl = `${bookingBase}/booking/${bookingToken}/reschedule`;
    const cancelUrl = `${bookingBase}/booking/${bookingToken}/cancel`;

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

      const allAttendees = [
        { email: guestEmail },
        ...additionalGuests.map((email) => ({ email })),
      ];

      const event = await calendar.events.insert({
        calendarId: "primary",
        // conferenceDataVersion: 1 is required for Google Meet to be auto-created
        conferenceDataVersion: 1,
        requestBody: {
          summary: title || `Meeting with ${guestName || guestEmail}`,
          description: enhancedDescription,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: allAttendees,
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
          additionalGuests: additionalGuests.length ? additionalGuests : null,
          status: "active",
        });
      }

      // Extract the Google Meet link from conferenceData entryPoints if present
      const meetEntryPoint = event.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === CALENDAR_ENTRY_POINT_TYPES.VIDEO,
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

  /**
   * Books a slot, optionally using an agenda to generate a meeting title via LLM.
   * Delegates to CalendarAgendaService.
   */
  async bookSlotWithAgenda(
    options: BookSlotOptions,
  ): Promise<calendar_v3.Schema$Event & { meetLink: string | null }> {
    const event = await this.calendarAgendaService.bookSlotWithAgenda(
      options,
      (opts: CreateEventOptions) => this.createEvent(opts),
    );

    // Never throws — a failed notification email must not fail the booking
    await this.bookingNotificationService.sendBookingNotifications(
      options,
      event,
    );

    return event;
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

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new Error("Cannot reschedule a cancelled booking");
    }

    const user = await this.usersService.findOne(booking.userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const newStart = new Date(newStartTime);
    const newEnd = new Date(
      newStart.getTime() + booking.durationMinutes * MILLISECONDS.MINUTE,
    );

    try {
      const additionalGuests = booking.additionalGuests ?? [];
      const allAttendees = [
        { email: booking.guestEmail },
        ...additionalGuests.map((email) => ({ email })),
      ];

      const event = await calendar.events.patch({
        calendarId: "primary",
        eventId: booking.googleEventId,
        requestBody: {
          start: { dateTime: newStart.toISOString() },
          end: { dateTime: newEnd.toISOString() },
          attendees: allAttendees,
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

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new Error("Booking is already cancelled");
    }

    const user = await this.usersService.findOne(booking.userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
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
      throw new Error(ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED);
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
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

  /**
   * Detect whether an email proposes a specific meeting time and check if
   * that slot is free on the user's Google Calendar.
   */
  async checkMeetingProposal(
    userId: string,
    emailId: string,
  ): Promise<MeetingProposalResult> {
    return checkMeetingProposal(this, userId, emailId);
  }

  /**
   * Re-check availability for an exact time/duration the user picked in the
   * scheduling panel (after editing the proposed slot). Returns whether that
   * specific slot is free, so the conflict warning stays accurate as they edit.
   */
  async checkTimeAvailability(
    userId: string,
    proposedTime: string,
    durationMinutes: number | null,
  ): Promise<{
    isAvailable: boolean | null;
    suggestedTime: string | null;
    calendarConnected: boolean;
    conflictingEvents: ConflictingEvent[];
  }> {
    return checkTimeAvailability(this, userId, proposedTime, durationMinutes);
  }

  /**
   * Create a calendar event using the sender of an email as the guest.
   * Used when a sender proposes a specific time and the user confirms it.
   */
  async createEventFromEmailProposal(
    userId: string,
    emailId: string,
    proposedTime: string,
    topic: string,
    durationMinutes: number,
  ): Promise<{
    meetLink: string | null;
    eventId: string | null;
    htmlLink: string | null;
  }> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    const event = await this.createEvent({
      userId,
      startTime: proposedTime,
      durationMinutes,
      guestEmail: email.from,
      guestName: email.fromName || undefined,
      title: topic,
    });

    return {
      meetLink: event.meetLink,
      eventId: event.id ?? null,
      htmlLink: event.htmlLink ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // ICS attachment support — delegated to CalendarIcsService
  // ---------------------------------------------------------------------------

  async parseIcsAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsEventData> {
    return this.calendarIcsService.parseIcsAttachment(
      userId,
      emailId,
      attachmentId,
    );
  }

  async checkEventExists(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{
    exists: boolean;
    calendarEventId?: string;
    userResponseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
    htmlLink?: string;
  }> {
    return this.calendarIcsService.checkEventExists(userId, eventData);
  }

  async addIcsEventToCalendar(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{ success: boolean; eventLink?: string }> {
    return this.calendarIcsService.addIcsEventToCalendar(userId, eventData);
  }

  async getIcsInfo(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsInfoResponse> {
    return this.calendarIcsService.getIcsInfo(userId, emailId, attachmentId);
  }

  async acceptCounterProposal(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{
    success: boolean;
    newStartAt: string;
    newEndAt?: string;
    htmlLink?: string;
  }> {
    return this.calendarIcsService.acceptCounterProposal(
      userId,
      emailId,
      attachmentId,
    );
  }

  async declineCounterProposal(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{ success: boolean }> {
    return this.calendarIcsService.declineCounterProposal(
      userId,
      emailId,
      attachmentId,
    );
  }

  async rsvpByEventId(
    userId: string,
    calendarEventId: string,
    response: "accepted" | "declined" | "tentative",
  ): Promise<{
    userResponseStatus: "accepted" | "declined" | "tentative";
    htmlLink?: string;
  }> {
    return rsvpByEventId(this, userId, calendarEventId, response);
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

  private isTokenExpiredError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("invalid_grant") ||
      msg.includes("Token has been expired") ||
      msg.includes("Token has been revoked") ||
      (msg.includes("401") && msg.includes("Unauthorized"))
    );
  }
}
