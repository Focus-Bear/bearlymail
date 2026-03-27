import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS, MINUTES } from "../constants/time-constants";
import { EmailsService } from "../emails/emails.service";
import { UsersService } from "../users/users.service";
import { normalizeTimezone } from "../utils/timezone.utils";
import { parseIcsStringSafe } from "./calendar-ics-parser";
import { IcsEventData, IcsInfoResponse } from "./ics-event.types";

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
  ) {}

  /**
   * Create a fresh per-request OAuth2Client for a given user's credentials.
   */
  createOAuth2Client(user: {
    googleCalendarAccessToken: string;
    googleCalendarRefreshToken?: string | null;
  }): OAuth2Client {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3001/auth/google/callback",
    );
    client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });
    return client;
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
        // Extract user's RSVP status from event attendees
        // user.email is auto-decrypted by TypeORM transformer
        const userEmail = user.email;
        const userAttendee = match.attendees?.find(
          (att) => att.email?.toLowerCase() === userEmail?.toLowerCase(),
        );
        // If user is the organizer and not in attendees, check organizer field
        const isOrganizer =
          !userAttendee &&
          match.organizer?.email?.toLowerCase() === userEmail?.toLowerCase();
        const userResponseStatus:
          | "accepted"
          | "declined"
          | "tentative"
          | "needsAction" =
          (userAttendee?.responseStatus as
            | "accepted"
            | "declined"
            | "tentative"
            | "needsAction") ?? (isOrganizer ? "accepted" : "needsAction");

        return {
          exists: true,
          calendarEventId: match.id ?? undefined,
          userResponseStatus,
          htmlLink: match.htmlLink ?? undefined,
        };
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

    const eventBody: calendar_v3.Schema$Event = {
      summary: eventData.title,
      location: eventData.location,
      description: eventData.description,
      start: eventData.allDay
        ? { date: eventData.startAt.slice(0, 10) }
        : {
            dateTime: eventData.startAt,
            timeZone: safeTimezone,
          },
      end: eventData.allDay
        ? { date: allDayEndDate! }
        : {
            dateTime: eventData.endAt ?? eventData.startAt,
            timeZone: safeTimezone,
          },
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
    try {
      ({ exists, calendarEventId, userResponseStatus, htmlLink } =
        await this.checkEventExists(userId, event));
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
    };
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
