import { Injectable, Logger } from "@nestjs/common";

import { LLMToneService } from "../llm/llm-tone.service";
import { UsersService } from "../users/users.service";
import { CalendarService } from "./calendar.service";
import {
  AttendeeEvent,
  buildCalendarConflictWarning,
  CALENDAR_CONFLICT_LOOKAHEAD_DAYS,
  CALENDAR_CONFLICT_LOOKBACK_DAYS,
} from "./calendar-meeting-conflict.helper";

/** Extract a bare lowercased email address from an RFC-5322 address token. */
function extractEmailAddress(address: string): string {
  const match = address.match(/<([^>]{1,320})>/);
  return (match ? match[1] : address).trim().toLowerCase();
}

@Injectable()
export class CalendarMeetingConflictService {
  private readonly logger = new Logger(CalendarMeetingConflictService.name);

  constructor(
    private readonly llmToneService: LLMToneService,
    private readonly calendarService: CalendarService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Pre-send advisory check: if the outbound draft names a day for a meeting/call
   * with the recipient, cross-check the user's Google Calendar for an event with
   * that person and warn when the stated day does not line up. Advisory only —
   * returns `{ calendarWarning: null }` and never throws when the calendar is not
   * connected, no meeting date is mentioned, or anything goes wrong.
   */
  async checkOutboundMeetingReferences(params: {
    userId: string;
    text: string;
    recipients: string[];
    currentDate: string;
    timezone: string;
  }): Promise<{ calendarWarning: string | null }> {
    const { userId, text, recipients, currentDate, timezone } = params;
    const none = { calendarWarning: null };

    try {
      if (!text?.trim() || recipients.length === 0) {
        return none;
      }

      const user = await this.usersService.findOne(userId);
      if (!user?.googleCalendarAccessToken) {
        // Calendar not connected — degrade silently.
        return none;
      }

      const references = await this.llmToneService.extractMeetingDateReferences(
        text,
        currentDate,
        timezone,
        userId,
      );
      const meetingRefs = references.filter(
        (reference) => reference.isMeetingWithRecipient,
      );
      if (meetingRefs.length === 0) {
        // No meeting date mentioned — skip the calendar lookup entirely.
        return none;
      }

      const recipientEmail = extractEmailAddress(recipients[0]);
      if (!recipientEmail.includes("@")) {
        return none;
      }

      const events = await this.calendarService.findEventsWithAttendee(
        userId,
        recipientEmail,
        CALENDAR_CONFLICT_LOOKAHEAD_DAYS,
        CALENDAR_CONFLICT_LOOKBACK_DAYS,
      );

      const personLabel = this.resolvePersonLabel(
        events,
        recipientEmail,
        recipients[0],
      );

      const calendarWarning = buildCalendarConflictWarning({
        references: meetingRefs,
        events: events as AttendeeEvent[],
        personLabel,
        timezone,
      });

      return { calendarWarning };
    } catch (error) {
      // Never let a calendar hiccup block a send; do not log calendar contents.
      this.logger.warn(
        `Calendar meeting-conflict check failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return none;
    }
  }

  /** Prefer the recipient's calendar display name, falling back to the address. */
  private resolvePersonLabel(
    events: Array<{
      attendees?: Array<{
        email: string | null | undefined;
        displayName: string | null | undefined;
      }>;
    }>,
    recipientEmail: string,
    rawRecipient: string,
  ): string {
    for (const event of events) {
      const match = event.attendees?.find(
        (attendee) => attendee.email?.toLowerCase() === recipientEmail,
      );
      if (match?.displayName) {
        return match.displayName;
      }
    }
    const nameMatch = rawRecipient.match(/^\s*"?([^"<]+?)"?\s*</);
    return nameMatch?.[1]?.trim() || recipientEmail;
  }
}
