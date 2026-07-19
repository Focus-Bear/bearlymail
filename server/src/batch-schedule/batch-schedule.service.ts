import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DateTime } from "luxon";
import { Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { DAYS, MINUTES, MINUTES_PER_HOUR } from "../constants/time-constants";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { FALLBACK_TIMEZONE, normalizeTimezone } from "../utils/timezone.utils";

@Injectable()
export class BatchScheduleService {
  private readonly logger = new Logger(BatchScheduleService.name);

  constructor(
    @InjectRepository(BatchSchedule)
    private batchScheduleRepository: Repository<BatchSchedule>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
  ) {}

  /**
   * Get the batch schedule for a user.
   * Sanitises the timezone field on read so that existing DB rows containing
   * Windows-style timezone strings (e.g. "Eastern Standard Time") are
   * transparently normalised to "UTC" before being returned to callers.
   * This prevents crashes in downstream code that uses Luxon / Intl with the
   * timezone value.
   */
  async getSchedule(userId: string): Promise<BatchSchedule | null> {
    const schedule = await this.batchScheduleRepository.findOne({
      where: { userId },
    });
    if (schedule) {
      schedule.timezone = normalizeTimezone(schedule.timezone);
    }
    return schedule;
  }

  /**
   * Create or update the batch schedule for a user
   */
  async upsertSchedule(
    userId: string,
    scheduleData: {
      deliveryDays: number[];
      deliveryTimes: string[];
      timezone: string;
      isEnabled: boolean;
      urgentBypassSchedule: boolean;
    },
  ): Promise<BatchSchedule> {
    let schedule = await this.batchScheduleRepository.findOne({
      where: { userId },
    });

    // Normalize deliveryDays: simple-array columns return strings from DB; clients may
    // send mixed types after round-tripping. Deduplicate and coerce to numbers.
    const normalizedDeliveryDays = [
      ...new Set(
        scheduleData.deliveryDays
          .map((day) => (typeof day === "string" ? parseInt(day, 10) : day))
          .filter((day) => !isNaN(day) && day >= 0 && day <= DAYS.SATURDAY),
      ),
    ].sort((itemA, itemB) => itemA - itemB);

    const normalizedTimezone = normalizeTimezone(scheduleData.timezone);

    if (schedule) {
      schedule.deliveryDays = normalizedDeliveryDays;
      schedule.deliveryTimes = scheduleData.deliveryTimes;
      schedule.timezone = normalizedTimezone;
      schedule.isEnabled = scheduleData.isEnabled;
      schedule.urgentBypassSchedule = scheduleData.urgentBypassSchedule;
    } else {
      schedule = this.batchScheduleRepository.create({
        userId,
        ...scheduleData,
        deliveryDays: normalizedDeliveryDays,
        timezone: normalizedTimezone,
      });
    }

    const savedSchedule = await this.batchScheduleRepository.save(schedule);

    // Re-evaluate existing batched emails against the new schedule.
    // Emails that were batched under the old (possibly broken) schedule may have a
    // batchReleaseAt that is later than what the new schedule would produce. Move
    // those emails forward to the earliest valid window under the updated schedule
    // so that past-missed batches are delivered as soon as possible.
    await this.rescheduleExistingBatchedEmails(userId, savedSchedule);

    return savedSchedule;
  }

  /**
   * After a schedule change, update the batchReleaseAt for any batched threads
   * whose current release time would be delivered sooner under the new schedule.
   * If the schedule is disabled or has no delivery windows configured, all
   * pending batched threads are released immediately (isBatched = false).
   *
   * Also immediately releases any threads whose batchReleaseAt is already in
   * the past — these are threads that should have been delivered but weren't
   * due to previous bugs in the scheduling logic.
   */
  private async rescheduleExistingBatchedEmails(
    userId: string,
    schedule: BatchSchedule,
  ): Promise<void> {
    // First: release any threads that are already past their batch release time.
    // These are overdue deliveries that should have been shown to the user already.
    const pastDueResult = await this.emailThreadRepository.query(
      `UPDATE email_threads
         SET "isBatched" = false,
             "batchDecisionReason" = 'Auto-released: past delivery window'
       WHERE "userId" = $1
         AND "isBatched" = true
         AND "batchReleaseAt" IS NOT NULL
         AND "batchReleaseAt" < NOW()`,
      [userId],
    );
    const pastDueCount = pastDueResult[1] ?? 0;
    if (pastDueCount > 0) {
      this.logger.log(
        `Released ${pastDueCount} past-due batched threads for user ${userId}`,
      );
    }

    if (!schedule.isEnabled) {
      // Batching disabled — release all remaining pending threads immediately
      const updated = await this.emailThreadRepository.update(
        { userId, isBatched: true },
        { isBatched: false, batchDecisionReason: "Schedule disabled" },
      );
      this.logger.log(
        `Schedule disabled: released ${updated.affected ?? 0} batched threads for user ${userId}`,
      );
      return;
    }

    const newReleaseTime = this.getNextScheduledDeliveryTime(schedule);
    if (!newReleaseTime) {
      // No delivery windows configured — release all remaining pending threads
      const updated = await this.emailThreadRepository.update(
        { userId, isBatched: true },
        {
          isBatched: false,
          batchDecisionReason: "No delivery window configured",
        },
      );
      this.logger.log(
        `No delivery windows: released ${updated.affected ?? 0} batched threads for user ${userId}`,
      );
      return;
    }

    // Update only the threads whose current batchReleaseAt is LATER than what the
    // new schedule would produce — i.e., move them forward to the earlier time.
    const rawUpdated = await this.emailThreadRepository.query(
      `UPDATE email_threads
         SET "batchReleaseAt" = $1,
             "batchDecisionReason" = $2
       WHERE "userId" = $3
         AND "isBatched" = true
         AND "batchReleaseAt" > $1`,
      [
        newReleaseTime,
        `Schedule updated: batched until ${newReleaseTime.toISOString()}`,
        userId,
      ],
    );

    this.logger.log(
      `Schedule updated: rescheduled batched threads for user ${userId} to ${newReleaseTime.toISOString()} (rows affected: ${rawUpdated[1] ?? "unknown"})`,
    );
  }

  /**
   * Calculate the next batch release time based on the schedule
   */
  getNextBatchReleaseTime(
    schedule: BatchSchedule,
    priorityScore: number = 0,
  ): Date | null {
    // If batching is disabled, release immediately
    if (!schedule.isEnabled) {
      return null;
    }

    // If priority score >= 75 (HIGH_THRESHOLD) and urgentBypassSchedule is enabled, release immediately
    // Only truly high-priority emails should bypass batching to avoid false positives
    if (
      priorityScore >= PRIORITY_SCORES.HIGH_THRESHOLD &&
      schedule.urgentBypassSchedule
    ) {
      return null;
    }

    return this.getNextScheduledDeliveryTime(schedule);
  }

  /**
   * Calculate the next scheduled delivery time based on the schedule
   * This ignores the isEnabled flag and urgency scores - used for display purposes
   */
  getNextScheduledDeliveryTime(schedule: BatchSchedule): Date | null {
    // If no delivery days or times configured, return null
    if (!schedule.deliveryDays || schedule.deliveryDays.length === 0) {
      return null;
    }
    if (!schedule.deliveryTimes || schedule.deliveryTimes.length === 0) {
      return null;
    }

    const userTimezone = normalizeTimezone(
      schedule.timezone || FALLBACK_TIMEZONE,
    );
    const now = DateTime.now().setZone(userTimezone);

    // Ensure deliveryDays are numbers (they might be stored as strings in DB)
    const deliveryDays = schedule.deliveryDays.map((day) =>
      typeof day === "string" ? parseInt(day, 10) : day,
    );

    // Luxon uses 1-7 (Mon-Sun), convert to 0-6 (Sun-Sat)
    const currentDay = now.weekday % DAYS.WEEK;
    const currentTime = now.toFormat("HH:mm");

    // Parse delivery times and sort them
    const sortedTimes = [...schedule.deliveryTimes].sort();

    // Check if we can deliver today
    if (deliveryDays.includes(currentDay)) {
      // Find the next delivery time today
      for (const time of sortedTimes) {
        if (time > currentTime) {
          const [hours, minutes] = time.split(":").map(Number);
          return now
            .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
            .toJSDate();
        }
      }
    }

    // Find the next delivery day
    let daysToAdd = 1;
    while (daysToAdd <= DAYS.WEEK) {
      const nextDay = (currentDay + daysToAdd) % DAYS.WEEK;
      if (deliveryDays.includes(nextDay)) {
        // Use the first delivery time of that day
        const [hours, minutes] = sortedTimes[0].split(":").map(Number);
        return now
          .plus({ days: daysToAdd })
          .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
          .toJSDate();
      }
      daysToAdd++;
    }

    // No delivery days configured
    return null;
  }

  /**
   * Create a date object for a specific time in a timezone
   * The result is in UTC (for storage) but represents the local time in the given timezone
   */
  /**
   * Check if now is within delivery hours
   */
  isWithinDeliveryWindow(schedule: BatchSchedule): boolean {
    if (!schedule.isEnabled) return true;

    const now = new Date();
    const userTimezone = normalizeTimezone(
      schedule.timezone || FALLBACK_TIMEZONE,
    );
    const nowInUserTz = new Date(
      now.toLocaleString("en-US", { timeZone: userTimezone }),
    );

    const currentDay = nowInUserTz.getDay();
    const currentTime = `${String(nowInUserTz.getHours()).padStart(2, "0")}:${String(nowInUserTz.getMinutes()).padStart(2, "0")}`;

    // Normalize to numbers (simple-array stores as strings in DB)
    const deliveryDays = schedule.deliveryDays.map((day) =>
      typeof day === "string" ? parseInt(day, 10) : day,
    );

    // Check if today is a delivery day
    if (!deliveryDays.includes(currentDay)) {
      return false;
    }

    // Check if current time is within 30 minutes of a delivery time
    for (const deliveryTime of schedule.deliveryTimes) {
      const [dHours, dMinutes] = deliveryTime.split(":").map(Number);
      const deliveryMinutes = dHours * MINUTES_PER_HOUR + dMinutes;
      const [cHours, cMinutes] = currentTime.split(":").map(Number);
      const currentMinutes = cHours * MINUTES_PER_HOUR + cMinutes;

      // Within 30 minutes after delivery time
      if (
        currentMinutes >= deliveryMinutes &&
        currentMinutes < deliveryMinutes + MINUTES.THIRTY
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get default schedule for new users
   */
  getDefaultSchedule(): Partial<BatchSchedule> {
    return {
      // Monday to Friday
      deliveryDays: [1, 2, 3, 4, 5],
      // 11am and 3pm
      deliveryTimes: ["11:00", "15:00"],
      // Empty on purpose: this default is only for a user who hasn't saved a
      // schedule yet, and the client fills a blank timezone with the browser's
      // detected zone. Returning "UTC" here made the timezone <select> fall to
      // its first option (Africa/Abidjan) since bare "UTC" isn't in the list.
      timezone: "",
      isEnabled: true,
      urgentBypassSchedule: true,
    };
  }
}
