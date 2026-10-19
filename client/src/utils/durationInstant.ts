import { parseDurationToDate } from 'utils/parseDuration';

/**
 * Resolves a free-text duration ("tomorrow", "next Monday", "3d") to an ISO
 * instant in the browser's timezone, with the parser that draws the inline
 * "Reappears …" / follow-up preview. The API runs in UTC, so if it parsed the
 * phrase itself an Australian morning's "tomorrow" would land at 7pm the same
 * day. Sending this instant alongside the raw text keeps the server on the
 * time the user saw; the text stays as its fallback. Undefined when the
 * duration cannot be parsed.
 */
export function resolveDurationInstant(duration: string, locale: string, now: Date = new Date()): string | undefined {
  return parseDurationToDate(duration, now, locale)?.toISOString();
}
