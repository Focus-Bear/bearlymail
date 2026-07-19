import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";

import { createUserGoogleOAuthClient } from "../auth/google-oauth-client";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS, MINUTES } from "../constants/time-constants";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { UsersService } from "../users/users.service";
import { normalizeTimezone } from "../utils/timezone.utils";
import { parseIcsStringSafe } from "./calendar-ics-parser";
import { IcsEventData, IcsInfoResponse } from "./ics-event.types";

const ICS_METHOD_COUNTER = "COUNTER";

/**
 * Safely extracts an error code from an unknown error value.
 * Avoids no-explicit-any and no-nested-ternary lint rules.
 */
function getErrCode(err: unknown): string | number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err) return (err as { code?: string | number }).code;
  if ("status" in err) return (err as { status?: number }).status;
  return undefined;
}

/**
 * Handles all ICS/calendar-attachment functionality:
 *  - Fetching and parsing ICS attachments from emails
 *  - Checking whether an event already exists in Google Calendar
 *  - Adding parsed ICS events to Google Calendar
 */
@Injectable()
export class CalendarIcsService {
  public readonly logger = new Logger(CalendarIcsService.name);

  constructor(
    public usersService: UsersService,
    public emailsService: EmailsService,
    public emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * Create a fresh per-request OAuth2Client for a given user's credentials.
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
   * Determine whether an error from the Google API represents an expired /
   * revoked token so we can surface a user-friendly message.
   */
  private isTokenExpiredError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("invalid_grant") ||
      msg.includes("Token has been expired") ||
      msg.includes("Token has been revoked") ||
      (msg.includes("401") && msg.includes("Unauthorized"))
    );
  }

  /**
   * Fetch an ICS attachment via the emails service, parse the first VEVENT,
   * and return a structured IcsEventData object.
   *
   * Throws BadRequestException for parse errors (400) so the controller can
   * propagate meaningful HTTP responses instead of a raw 500.
   */
  async parseIcsAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsEventData> {
    let attachmentBuffer: Buffer;
    try {
      ({ attachmentBuffer } = await this.emailsService.getAttachment(
        userId,
        emailId,
        attachmentId,
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ICS] Failed to fetch attachment ${attachmentId} for email ${emailId}: ${message}`,
      );
      throw new NotFoundException(
        `Could not retrieve ICS attachment: ${message}`,
      );
    }

    const icsString = attachmentBuffer.toString("utf-8");
    const result = parseIcsStringSafe(icsString);
    if (result.ok === false) {
      this.logger.warn(
        `[ICS] Parse error for attachment ${attachmentId} on email ${emailId}: ${result.error}`,
      );
      throw new BadRequestException(
        `Could not parse calendar invite: ${result.error}`,
      );
    }
    return result.event;
  }

  /**
   * Check whether a user's Google Calendar already contains an event matching
   * the given ICS event.
   *
   * Matching strategy (in priority order):
   *  1. If the ICS event carries a UID, use Google Calendar's `iCalUID` filter
   *     for an exact, authoritative match — no false positives.
   *  2. Otherwise, fall back to a time-window query and require BOTH an exact
   *     title match AND start-time proximity (±5 min) to reduce false positives
   *     from the previous `q:` full-text search approach.
   *
   * Returns { exists: false } if the user hasn't connected Google Calendar.
   */
  async checkEventExists(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{
    exists: boolean;
    calendarEventId?: string;
    userResponseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
    htmlLink?: string;
    /** The matched event's CURRENT start/end (ISO 8601 UTC) — lets callers compare against a COUNTER ics's proposed startAt/endAt. */
    currentStartAt?: string;
    currentEndAt?: string;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      return { exists: false };
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });
    const startMs = new Date(eventData.startAt).getTime();
    const FIVE_MINUTES_MS = MINUTES.FIVE * MILLISECONDS.MINUTE;

    try {
      // Use iCalUID for exact matching when the ICS provides a UID.
      // This is far more reliable than full-text q: search which can produce
      // false positives / false negatives (e.g. when title is "(No title)").
      const usingUid = !!eventData.uid;

      const listParams = usingUid
        ? {
            calendarId: "primary",
            iCalUID: eventData.uid,
            // iCalUID is a direct key lookup — no time constraint needed.
            // Time constraints would cause false negatives for rescheduled events.
            singleEvents: true,
          }
        : {
            calendarId: "primary",
            timeMin: new Date(startMs - FIVE_MINUTES_MS).toISOString(),
            timeMax: new Date(startMs + FIVE_MINUTES_MS).toISOString(),
            // Deliberately omit `q:` — full-text search risks false negatives
            // when title is "(No title)" and false positives on common titles.
            // We verify both title and time in the find() below instead.
            singleEvents: true,
          };

      const response = await calendar.events.list(listParams);

      const match = (response.data.items ?? []).find((ev) => {
        if (usingUid) {
          // iCalUID match is authoritative — any returned event is the same event.
          return true;
        }
        // Fallback: require BOTH exact summary AND start-time proximity to
        // avoid false positives from same-named events near the same time.
        const evStart = ev.start?.dateTime ?? ev.start?.date;
        if (!evStart) return false;
        const diff = Math.abs(new Date(evStart).getTime() - startMs);
        return diff <= FIVE_MINUTES_MS && ev.summary === eventData.title;
      });

      if (match) {
        // user.email is auto-decrypted by TypeORM transformer
        return this.buildEventExistsResult(match, user.email);
      }
      return { exists: false };
    } catch {
      // If we can't check, assume not exists (add button will surface any error)
      return { exists: false };
    }
  }

  /**
   * Build the checkEventExists() result from a matched Google Calendar event.
   * Extracted to keep checkEventExists under the complexity limit.
   */
  private buildEventExistsResult(
    match: calendar_v3.Schema$Event,
    userEmail: string | null | undefined,
  ): {
    exists: true;
    calendarEventId?: string;
    userResponseStatus: "accepted" | "declined" | "tentative" | "needsAction";
    htmlLink?: string;
    currentStartAt?: string;
    currentEndAt?: string;
  } {
    // Extract user's RSVP status from event attendees
    const userAttendee = match.attendees?.find(
      (att) => att.email?.toLowerCase() === userEmail?.toLowerCase(),
    );
    // If user is the organizer and not in attendees, check organizer field
    const isOrganizer =
      !userAttendee &&
      match.organizer?.email?.toLowerCase() === userEmail?.toLowerCase();
    const userResponseStatus =
      (userAttendee?.responseStatus as
        | "accepted"
        | "declined"
        | "tentative"
        | "needsAction"
        | undefined) ?? (isOrganizer ? "accepted" : "needsAction");

    const currentStart = match.start?.dateTime ?? match.start?.date;
    const currentEnd = match.end?.dateTime ?? match.end?.date;

    return {
      exists: true,
      calendarEventId: match.id ?? undefined,
      userResponseStatus,
      htmlLink: match.htmlLink ?? undefined,
      currentStartAt: currentStart
        ? new Date(currentStart).toISOString()
        : undefined,
      currentEndAt: currentEnd ? new Date(currentEnd).toISOString() : undefined,
    };
  }

  /**
   * Build the Google Calendar start/end fields for a parsed ICS event,
   * handling all-day vs timed events and normalising the timezone.
   * Shared by addIcsEventToCalendar and acceptCounterProposal.
   */
  private buildEventTimeFields(eventData: IcsEventData): {
    start: calendar_v3.Schema$EventDateTime;
    end: calendar_v3.Schema$EventDateTime;
  } {
    // Google Calendar requires all-day event end date to be the day AFTER
    // the last day (exclusive end). Compute this by adding 1 day to the last
    // all-day date so a single-day event (startAt == endAt) has end = start+1.
    let allDayEndDate: string | undefined;
    if (eventData.allDay) {
      const lastDay = new Date(
        `${(eventData.endAt ?? eventData.startAt).slice(0, 10)}T00:00:00Z`,
      );
      lastDay.setUTCDate(lastDay.getUTCDate() + 1);
      allDayEndDate = lastDay.toISOString().slice(0, 10);
    }

    // Belt-and-suspenders: normalizeTimezone ensures we never pass a non-IANA
    // string to Google Calendar even if the parser didn't catch it.
    const safeTimezone = normalizeTimezone(eventData.timezone ?? "UTC");
    if (safeTimezone !== eventData.timezone) {
      this.logger.warn(
        `[ICS] Non-IANA timezone "${eventData.timezone}" normalised to "${safeTimezone}" before Google Calendar API call`,
      );
    }

    return {
      start: eventData.allDay
        ? { date: eventData.startAt.slice(0, 10) }
        : { dateTime: eventData.startAt, timeZone: safeTimezone },
      end: eventData.allDay
        ? { date: allDayEndDate! }
        : {
            dateTime: eventData.endAt ?? eventData.startAt,
            timeZone: safeTimezone,
          },
    };
  }

  /**
   * Add a parsed ICS event to the user's primary Google Calendar.
   * Returns { success, eventLink }.
   *
   * Throws BadRequestException / NotFoundException for known error conditions
   * rather than a generic Error so the controller can return proper HTTP codes.
   */
  async addIcsEventToCalendar(
    userId: string,
    eventData: IcsEventData,
  ): Promise<{ success: boolean; eventLink?: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new BadRequestException(
        ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED,
      );
    }

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const { start, end } = this.buildEventTimeFields(eventData);

    const eventBody: calendar_v3.Schema$Event = {
      summary: eventData.title,
      location: eventData.location,
      description: eventData.description,
      start,
      end,
      attendees: eventData.attendees.map((att) => ({
        email: att.email,
        displayName: att.name,
        responseStatus: this.mapAttendeeStatus(att.status),
      })),
    };

    try {
      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: eventBody,
      });

      return {
        success: true,
        eventLink: created.data.htmlLink ?? undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("[ICS] addIcsEventToCalendar failed", {
        message,
        stack: err instanceof Error ? err.stack : undefined,
        errorCode: getErrCode(err),
        userId,
      });
      if (this.isTokenExpiredError(err)) {
        throw new BadRequestException(
          "Your Google Calendar access has expired. Please reconnect your Google account.",
        );
      }
      throw new BadRequestException(
        `Failed to add event to calendar: ${message}`,
      );
    }
  }

  /**
   * Full flow: parse ICS attachment and check if the event already exists in
   * Google Calendar. Returns structured IcsInfoResponse for the frontend.
   *
   * Propagates BadRequestException / NotFoundException from parseIcsAttachment
   * so the controller can return proper HTTP status codes.  Unexpected errors
   * are logged and re-thrown.
   */
  async getIcsInfo(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<IcsInfoResponse> {
    // parseIcsAttachment already throws BadRequestException / NotFoundException
    // on known failures — let those propagate naturally.
    const event = await this.parseIcsAttachment(userId, emailId, attachmentId);

    let exists = false;
    let calendarEventId: string | undefined;
    let userResponseStatus:
      | "accepted"
      | "declined"
      | "tentative"
      | "needsAction"
      | undefined;
    let htmlLink: string | undefined;
    let currentStartAt: string | undefined;
    let currentEndAt: string | undefined;
    try {
      ({
        exists,
        calendarEventId,
        userResponseStatus,
        htmlLink,
        currentStartAt,
        currentEndAt,
      } = await this.checkEventExists(userId, event));
    } catch (err) {
      // checkEventExists failing should not block the user from seeing event
      // details — log and continue with exists=false.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ICS] checkEventExists failed for user ${userId}: ${message}`,
      );
    }

    return {
      event,
      alreadyInCalendar: exists,
      calendarEventId,
      userResponseStatus,
      htmlLink,
      currentStartAt,
      currentEndAt,
    };
  }

  /** Uppercases and normalises an ICS method for comparison ("Counter" → "COUNTER"). */
  private static normalizeMethod(method: string | undefined): string {
    return (method ?? "").toUpperCase();
  }

  /**
   * Parse a COUNTER ics and locate its matching Google Calendar event.
   * Shared validation for acceptCounterProposal/declineCounterProposal.
   *
   * Throws BadRequestException if the ics isn't a COUNTER, or NotFoundException
   * if no matching calendar event was found to act on.
   */
  private async loadCounterProposal(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{
    event: IcsEventData;
    calendarEventId: string;
    proposer: IcsEventData["attendees"][number];
    currentStartAt?: string;
    currentEndAt?: string;
  }> {
    const event = await this.parseIcsAttachment(userId, emailId, attachmentId);
    if (
      CalendarIcsService.normalizeMethod(event.method) !== ICS_METHOD_COUNTER
    ) {
      throw new BadRequestException(
        "This calendar invite is not a reschedule request",
      );
    }

    const { exists, calendarEventId, currentStartAt, currentEndAt } =
      await this.checkEventExists(userId, event);
    if (!exists || !calendarEventId) {
      throw new NotFoundException(
        "No matching calendar event found — it may have already been deleted",
      );
    }

    const proposer = event.attendees[0];
    if (!proposer) {
      throw new BadRequestException(
        "Reschedule request has no attendee to respond to",
      );
    }

    return { event, calendarEventId, proposer, currentStartAt, currentEndAt };
  }

  /**
   * Accept a reschedule request (METHOD:COUNTER ics): move the matched
   * calendar event to the countering attendee's proposed new time and mark
   * them as accepted. `sendUpdates: "all"` makes Google Calendar itself
   * notify every attendee of the change — no separate email needed.
   *
   * Throws BadRequestException if the ics isn't a COUNTER or Google Calendar
   * isn't connected, NotFoundException if no matching event exists.
   */
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
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new BadRequestException(
        ERROR_MESSAGES.GOOGLE_CALENDAR_NOT_CONNECTED,
      );
    }

    const { event, calendarEventId, proposer } = await this.loadCounterProposal(
      userId,
      emailId,
      attachmentId,
    );

    const oauth2Client = this.createOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      const existing = await calendar.events.get({
        calendarId: "primary",
        eventId: calendarEventId,
      });
      const proposerEmail = proposer.email.toLowerCase();
      let proposerFound = false;
      const updatedAttendees = (existing.data.attendees ?? []).map((att) => {
        if (att.email?.toLowerCase() === proposerEmail) {
          proposerFound = true;
          return { ...att, responseStatus: "accepted" };
        }
        return att;
      });
      // Defensive: the proposer may be missing from the calendar event's own
      // attendee list (e.g. added via a group alias, or the event was
      // modified since the ics was sent) — add them rather than silently
      // dropping their acceptance.
      if (!proposerFound) {
        updatedAttendees.push({
          email: proposer.email,
          displayName: proposer.name,
          responseStatus: "accepted",
        });
      }

      const { start, end } = this.buildEventTimeFields(event);
      const patched = await calendar.events.patch({
        calendarId: "primary",
        eventId: calendarEventId,
        sendUpdates: "all",
        requestBody: { start, end, attendees: updatedAttendees },
      });

      this.logger.log(
        `[ICS] Accepted reschedule for event ${calendarEventId} — moved to ${event.startAt}`,
      );

      return {
        success: true,
        newStartAt: event.startAt,
        newEndAt: event.endAt,
        htmlLink: patched.data.htmlLink ?? undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("[ICS] acceptCounterProposal failed", {
        message,
        errorCode: getErrCode(err),
        userId,
        calendarEventId,
      });
      if (this.isTokenExpiredError(err)) {
        throw new BadRequestException(
          "Your Google Calendar access has expired. Please reconnect your Google account.",
        );
      }
      throw new BadRequestException(
        `Failed to accept the new time: ${message}`,
      );
    }
  }

  /**
   * Decline a reschedule request (METHOD:COUNTER ics): keep the calendar
   * event at its current time and reply in the email thread telling the
   * proposer the original time stands. Never mutates the calendar event.
   *
   * Throws BadRequestException if the ics isn't a COUNTER, NotFoundException
   * if no matching event exists.
   */
  async declineCounterProposal(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{ success: boolean }> {
    const { event, proposer, currentStartAt } = await this.loadCounterProposal(
      userId,
      emailId,
      attachmentId,
    );

    const email = await this.emailsService.getEmailById(userId, emailId);
    const keptTime = currentStartAt ?? event.startAt;
    // Format in the event's own timezone (falling back to UTC) rather than
    // a bare UTC string — a UTC timestamp is confusing to a proposer reading
    // in their own local time.
    const formattedKeptTime = new Date(keptTime).toLocaleString("en-US", {
      timeZone: normalizeTimezone(event.timezone ?? "UTC"),
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const body = [
      `Thanks for letting me know, ${proposer.name || proposer.email}.`,
      `Let's keep the original time: ${formattedKeptTime}.`,
    ].join("\n\n");

    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        throw new BadRequestException(
          "No email provider connected. Please connect your email account.",
        );
      }
      await provider.sendReply(userId, {
        threadId: email.threadId,
        to: proposer.email,
        subject: `Re: ${email.subject}`,
        body,
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("[ICS] declineCounterProposal failed to send reply", {
        message,
        userId,
        emailId,
      });
      throw new BadRequestException(
        `Failed to send the reply declining the new time: ${message}`,
      );
    }

    return { success: true };
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
