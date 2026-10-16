import { parseFutureInstant } from "../utils/future-instant.util";
import { parseDurationToDate } from "./parse-duration";

/**
 * Picks the moment a snooze ends.
 *
 * The API runs in UTC, so parsing a calendar phrase here resolves it on the UTC
 * calendar: "tomorrow" typed at 10am in Melbourne (still yesterday in UTC)
 * becomes 8am UTC today — 7pm the same evening for the user — and the snoozed
 * emails come straight back. The client resolves the phrase with the same
 * parser in the user's own timezone (it is what the "Reappears …" preview
 * shows), so its instant wins whenever it is a valid future time. The server's
 * own parse is the fallback for older clients and unparseable input.
 */
export function resolveSnoozeUntil(
  duration: string,
  locale: string,
  requestedSnoozeUntil: string | undefined,
  now: Date = new Date(),
): Date {
  return (
    // A past instant would wake the thread on the next expired-snooze sweep.
    parseFutureInstant(requestedSnoozeUntil, now) ??
    parseDurationToDate(duration, now, locale)
  );
}
