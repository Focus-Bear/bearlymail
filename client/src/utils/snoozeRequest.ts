import { parseDurationToDate } from 'utils/parseDuration';

export interface SnoozeRequestBody {
  duration: string;
  locale: string;
  /** ISO instant `duration` resolves to in the user's own timezone. */
  snoozeUntil?: string;
}

/**
 * Body for POST /snooze/:id and /snooze/bulk. The API runs in UTC, so if it
 * parsed "tomorrow" itself an Australian morning would resolve to 7pm the same
 * day and the snoozed emails would come straight back. Resolving the phrase
 * here — with the parser that draws the "Reappears …" preview — sends the
 * instant the user actually saw. `duration` stays as the server's fallback.
 */
export function buildSnoozeRequestBody(duration: string, locale: string, now: Date = new Date()): SnoozeRequestBody {
  const snoozeUntil = parseDurationToDate(duration, now, locale);
  if (!snoozeUntil) {
    return { duration, locale };
  }
  return { duration, locale, snoozeUntil: snoozeUntil.toISOString() };
}
