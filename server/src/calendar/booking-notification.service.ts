import { Injectable, Logger } from "@nestjs/common";
import { calendar_v3 } from "googleapis";

import { BookingEmailDetails, EmailService } from "../email/email.service";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
import { getErrorMessage, isError } from "../types/common";
import { UsersService } from "../users/users.service";
import { BookSlotOptions } from "./calendar-agenda.service";

const FALLBACK_TIMEZONE = "UTC";

/**
 * Sends post-booking emails: a confirmation to the guest and a "new booking"
 * notification to the host. Google Calendar does not email attendees an invite
 * here (events are inserted without `sendUpdates`), so these are the only
 * emails either party receives. Never throws — a failed email must not fail
 * the booking.
 */
@Injectable()
export class BookingNotificationService {
  private readonly logger = new Logger(BookingNotificationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly schedulingPreferencesService: SchedulingPreferencesService,
    private readonly emailService: EmailService,
  ) {}

  async sendBookingNotifications(
    options: BookSlotOptions,
    event: calendar_v3.Schema$Event & { meetLink: string | null },
  ): Promise<void> {
    try {
      const host = await this.usersService.findOne(options.userId);
      if (!host?.email) {
        this.logger.warn(
          `Skipping booking notification emails: host ${options.userId} has no email`,
        );
        return;
      }

      const details: BookingEmailDetails = {
        hostName: host.displayName || host.name || host.email,
        hostEmail: host.email,
        guestName: options.guestName,
        guestEmail: options.guestEmail,
        title:
          event.summary ||
          `Meeting with ${options.guestName || options.guestEmail}`,
        whenFormatted: this.formatStartTime(
          options.startTime,
          await this.resolveHostTimezone(options.userId),
        ),
        durationMinutes: options.durationMinutes,
        additionalGuests: options.additionalGuests ?? [],
        meetLink: event.meetLink ?? null,
      };

      await Promise.all([
        this.sendWithoutThrowing("guest confirmation", details.guestEmail, () =>
          this.emailService.sendBookingConfirmationEmail(details),
        ),
        this.sendWithoutThrowing("owner notification", details.hostEmail, () =>
          this.emailService.sendBookingOwnerNotificationEmail(details),
        ),
      ]);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send booking notification emails: ${getErrorMessage(error)}`,
        isError(error) ? error.stack : undefined,
      );
    }
  }

  private async sendWithoutThrowing(
    kind: string,
    toEmail: string,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
      this.logger.log(`Booking ${kind} email sent to ${toEmail}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send booking ${kind} email to ${toEmail}: ${getErrorMessage(error)}`,
        isError(error) ? error.stack : undefined,
      );
    }
  }

  private async resolveHostTimezone(userId: string): Promise<string> {
    try {
      const prefs =
        await this.schedulingPreferencesService.getPreferences(userId);
      return prefs?.timezone || FALLBACK_TIMEZONE;
    } catch {
      return FALLBACK_TIMEZONE;
    }
  }

  /**
   * Formats the slot start in the host's timezone with the zone name appended,
   * e.g. "Monday, 15 January 2024 at 10:00 am (Australia/Melbourne)". Guest
   * timezone is unknown server-side, so the zone is always shown explicitly.
   */
  private formatStartTime(startTime: string, timezone: string): string {
    try {
      return `${this.formatInTimezone(startTime, timezone)} (${timezone})`;
    } catch {
      this.logger.warn(
        `Failed to format booking start time "${startTime}" in timezone "${timezone}"; falling back to UTC`,
      );
      try {
        return `${this.formatInTimezone(startTime, FALLBACK_TIMEZONE)} (${FALLBACK_TIMEZONE})`;
      } catch {
        return `${startTime} (${FALLBACK_TIMEZONE})`;
      }
    }
  }

  private formatInTimezone(startTime: string, timezone: string): string {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(startTime));
  }
}
