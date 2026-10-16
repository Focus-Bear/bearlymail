import { resolveDurationInstant } from 'utils/durationInstant';

export interface SnoozeRequestBody {
  duration: string;
  locale: string;
  /** ISO instant `duration` resolves to in the user's own timezone. */
  snoozeUntil?: string;
}

/** Body for POST /snooze/:id and /snooze/bulk; see resolveDurationInstant for why it carries `snoozeUntil`. */
export function buildSnoozeRequestBody(duration: string, locale: string, now: Date = new Date()): SnoozeRequestBody {
  const snoozeUntil = resolveDurationInstant(duration, locale, now);
  if (!snoozeUntil) {
    return { duration, locale };
  }
  return { duration, locale, snoozeUntil };
}
