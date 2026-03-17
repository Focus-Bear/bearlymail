import { MILLISECONDS_PER_MINUTE, MINUTES_PER_HOUR } from 'constants/numbers';

/**
 * Returns the current time formatted as an ISO-8601-like string in the given
 * IANA timezone (e.g. "2026-03-18T09:33:00+11:00").
 *
 * The tone-check API passes this as "Current local time" to the LLM so it can
 * assess whether the email is being sent at an inappropriate hour.  Using UTC
 * (the default `new Date().toISOString()`) caused false positives for users
 * outside UTC — e.g. a Melbourne user composing at 09:33 AEDT would receive a
 * "late evening" warning because UTC was 22:33.
 *
 * Falls back to `new Date().toISOString()` if:
 *  - `timezone` is undefined / empty
 *  - the timezone string is not a valid IANA identifier
 *  - the runtime does not support `Intl.DateTimeFormat` with `timeZone`
 */
export function getCurrentTimeInTimezone(timezone?: string): string {
  if (!timezone) {
    return new Date().toISOString();
  }

  try {
    const now = new Date();

    // Build individual date/time parts in the target timezone using a locale
    // that produces unambiguous numeric output.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = fmt.formatToParts(now);
    const getPart = (type: string) => parts.find(part => part.type === type)?.value ?? '00';

    // Derive the UTC offset by comparing what the target zone says "now" is
    // versus the actual UTC epoch time.
    const localStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;

    // Parse the local wall-clock time as UTC to compute the offset.
    const localAsUtc = Date.parse(`${localStr}Z`);
    const offsetMinutes = Math.round((localAsUtc - now.getTime()) / MILLISECONDS_PER_MINUTE);

    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const offsetHH = String(Math.floor(absMinutes / MINUTES_PER_HOUR)).padStart(2, '0');
    const offsetMM = String(absMinutes % MINUTES_PER_HOUR).padStart(2, '0');

    return `${localStr}${sign}${offsetHH}:${offsetMM}`;
  } catch {
    // Invalid timezone or unsupported runtime — fall back to UTC ISO string.
    return new Date().toISOString();
  }
}
