import { parseDurationToDate } from 'utils/parseDuration';

export const DUE_DATE_STATUS = {
  EMPTY: 'empty',
  INVALID: 'invalid',
  PAST: 'past',
  VALID: 'valid',
} as const;

export type FocusBearDueDate =
  | { status: typeof DUE_DATE_STATUS.EMPTY | typeof DUE_DATE_STATUS.INVALID | typeof DUE_DATE_STATUS.PAST }
  | { status: typeof DUE_DATE_STATUS.VALID; date: Date; day: string };

const DAY_PART_LENGTH = 2;

/** `YYYY-MM-DD` of `date` in the user's own time zone: the day they meant, not the UTC one. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(DAY_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DAY_PART_LENGTH, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The due day for a custom date typed the way BearlyMail's snooze box takes it ("today", "tomorrow", "fri",
 * "2d", "next week", "30th"), parsed by the same parser so both boxes understand the same words. Only the
 * day is kept: a Focus Bear due date has no time. A day before today is refused rather than saved overdue.
 */
export function resolveFocusBearDueDate(input: string, now: Date = new Date(), locale = 'en'): FocusBearDueDate {
  if (!input.trim()) {
    return { status: DUE_DATE_STATUS.EMPTY };
  }
  const date = parseDurationToDate(input, now, locale);
  if (!date) {
    return { status: DUE_DATE_STATUS.INVALID };
  }
  const day = localDayKey(date);
  // Same-length YYYY-MM-DD keys sort as dates do.
  if (day < localDayKey(now)) {
    return { status: DUE_DATE_STATUS.PAST };
  }
  return { status: DUE_DATE_STATUS.VALID, date, day };
}
