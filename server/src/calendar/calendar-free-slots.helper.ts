/**
 * Pure helper functions for free-slot calculation in CalendarService.
 * Extracted from calendar.service.ts (issue #939 — pending decomposition batch 2).
 */

import { TEMPLATE_PART_TYPES } from "../constants/domain-types";
import {
  HOURS,
  MILLISECONDS,
  MINUTES,
  MINUTES_PER_HOUR,
} from "../constants/time-constants";
import { SchedulingPreferenceData } from "../scheduling-preferences/scheduling-preferences.service";

export interface BusyPeriod {
  start: string;
  end: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  duration: number;
}

/** Convert a UTC Date to a Date whose local fields represent the given timezone. */
export function toTzDate(date: Date, tz: string): Date {
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
    if (part.type !== TEMPLATE_PART_TYPES.LITERAL) {
      dateMap[part.type] = part.value;
    }
  });
  return new Date(
    Number(dateMap.year),
    Number(dateMap.month) - 1,
    Number(dateMap.day),
    Number(dateMap.hour),
    Number(dateMap.minute),
    Number(dateMap.second),
  );
}

/** Return an ISO-format YYYY-MM-DD string for the given date in the given timezone. */
export function toDayKey(date: Date, tz: string): string {
  const tzDate = toTzDate(date, tz);
  const year = tzDate.getFullYear();
  const month = String(tzDate.getMonth() + 1).padStart(2, "0");
  const day = String(tzDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Round a date forward to the next slot-duration boundary (seconds zeroed). */
export function alignToSlotBoundary(
  date: Date,
  slotDurationMinutes: number,
): Date {
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

/** Total busy minutes within the working window for a given calendar day key. */
export function getMeetingMinutesForDay(
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
    if (toDayKey(busyStart, tz) !== dayKey) continue;
    const tzStart = toTzDate(busyStart, tz);
    const dayStart = new Date(tzStart);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(tzStart);
    dayEnd.setHours(endHour, 0, 0, 0);
    const effectiveStart = tzStart < dayStart ? dayStart : tzStart;
    const effectiveEnd =
      toTzDate(busyEnd, tz) > dayEnd ? dayEnd : toTzDate(busyEnd, tz);
    if (effectiveEnd > effectiveStart) {
      total +=
        (effectiveEnd.getTime() - effectiveStart.getTime()) /
        MILLISECONDS.MINUTE;
    }
  }
  return total;
}

function advanceBySlot(date: Date, slotDurationMinutes: number): Date {
  return new Date(date.getTime() + slotDurationMinutes * MILLISECONDS.MINUTE);
}

function isInWorkingHours(
  date: Date,
  availDays: number[],
  startHour: number,
  endHour: number,
  tz: string,
): boolean {
  const tzDate = toTzDate(date, tz);
  const dayOfWeek = tzDate.getDay();
  const hour = tzDate.getHours();
  return availDays.includes(dayOfWeek) && hour >= startHour && hour < endHour;
}

function isSlotBusy(current: Date, slotEnd: Date, busy: BusyPeriod[]): boolean {
  return busy.some((itemB) => {
    const busyStart = new Date(itemB.start);
    const busyEnd = new Date(itemB.end);
    return (
      (current >= busyStart && current < busyEnd) ||
      (slotEnd > busyStart && slotEnd <= busyEnd) ||
      (current <= busyStart && slotEnd >= busyEnd)
    );
  });
}

function isTooCloseToMeeting(
  current: Date,
  slotEnd: Date,
  busy: BusyPeriod[],
  gapMinutes: number,
): boolean {
  return busy.some((itemB) => {
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
}

/**
 * Calculate available time slots within [start, end) given busy periods and preferences.
 * Respects working hours, available days, meeting gaps, and deep-work time quotas.
 */
export function calculateFreeSlots(
  start: Date,
  end: Date,
  busy: BusyPeriod[],
  prefs?: SchedulingPreferenceData,
  limit?: number,
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const slotDuration = prefs?.slotDurationMinutes || MINUTES.THIRTY;
  const startHour = prefs?.availabilityStartHour ?? HOURS.NINE;
  const endHour = prefs?.availabilityEndHour ?? HOURS.SEVENTEEN;
  const availDays = prefs?.availabilityDays ?? [1, 2, 3, 4, 5];
  const gapMinutes = prefs?.meetingGapMinutes ?? MINUTES.THIRTY;
  const deepWorkHours = prefs?.deepWorkHoursPerDay ?? 2;
  const tz = prefs?.timezone || "UTC";
  let current = alignToSlotBoundary(start, slotDuration);

  const meetingMinutesPerDay = new Map<string, number>();
  const totalAvailMinutes = (endHour - startHour) * MINUTES_PER_HOUR;
  const deepWorkMinutes = deepWorkHours * MINUTES_PER_HOUR;
  const maxBookableMinutes = totalAvailMinutes - deepWorkMinutes;

  while (current < end) {
    const slotEnd = advanceBySlot(current, slotDuration);
    const next = advanceBySlot(current, slotDuration);

    if (
      !isInWorkingHours(current, availDays, startHour, endHour, tz) ||
      isSlotBusy(current, slotEnd, busy) ||
      isTooCloseToMeeting(current, slotEnd, busy, gapMinutes)
    ) {
      current = next;
      continue;
    }

    const dayKey = toDayKey(current, tz);
    const existingMeetingMinutes = getMeetingMinutesForDay(
      dayKey,
      busy,
      startHour,
      endHour,
      tz,
    );
    const bookedSlotMinutes = meetingMinutesPerDay.get(dayKey) || 0;
    if (
      existingMeetingMinutes + bookedSlotMinutes + slotDuration >
      maxBookableMinutes
    ) {
      current = next;
      continue;
    }

    slots.push({
      start: current.toISOString(),
      end: slotEnd.toISOString(),
      duration: slotDuration,
    });
    meetingMinutesPerDay.set(dayKey, bookedSlotMinutes + slotDuration);
    if (limit !== undefined && slots.length >= limit) break;
    current = next;
  }

  return slots;
}
