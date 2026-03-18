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
 *  - the timezone string is not a valid IANA identifier (e.g. Windows-style
 *    strings like "Eastern Standard Time" are rejected)
 *  - the runtime does not support `Intl.DateTimeFormat` with `timeZone`
 *
 * Implementation note: uses `Intl.DateTimeFormat.formatToParts()` with explicit
 * part extraction rather than `toLocaleString()` because jsdom (used by Jest)
 * does not fully implement `Intl` timezone support — `toLocaleString('en-CA',
 * {timeZone: ...})` in jsdom returns an unparseable format, causing
 * `new Date(parsedString + 'Z')` → `Invalid Date` → NaN offsets.
 * `formatToParts()` with named parts is more reliable across jsdom and real
 * browser/Node runtimes.
 */
export const FALLBACK_TIMEZONE = 'UTC';
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * Returns true if `tz` is a valid IANA timezone identifier recognised by the
 * current runtime.  Windows-style timezone strings (e.g. "Eastern Standard
 * Time") are invalid IANA identifiers and will return false.
 *
 * Note: `Intl.supportedValuesOf('timeZone')` is intentionally NOT used here
 * because its list omits valid special identifiers like "UTC" in some runtimes
 * (e.g. Node's ICU data).  Constructing an `Intl.DateTimeFormat` is the
 * definitive check — the spec mandates a RangeError for invalid timezone
 * values, so this is both correct and reliable across all environments.
 */
export function isValidIANATimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getCurrentTimeInTimezone(timezone?: string): string {
  if (!timezone || !isValidIANATimezone(timezone)) {
    return new Date().toISOString(); // fallback for undefined or Windows timezone strings
  }

  try {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';

    const year = get('year');
    const month = get('month');
    const day = get('day');
    const minute = get('minute');
    const second = get('second');
    // Clamp hour=24 to 00 (midnight edge case in some ICU builds)
    const hour = get('hour') === '24' ? '00' : get('hour');

    // Compute UTC offset: build a UTC date from the local wall-clock values
    // and compare to now.
    // localStr has no milliseconds, so localAsUtc may be up to 999 ms behind
    // now.getTime(); Math.round corrects this sub-minute artefact.
    const localWallClock = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const localAsUtc = new Date(`${localWallClock}Z`);

    if (isNaN(localAsUtc.getTime())) {
      return new Date().toISOString();
    }

    const offsetMs = localAsUtc.getTime() - now.getTime();
    const offsetMinutes = Math.round(offsetMs / MILLISECONDS_PER_MINUTE);

    // offsetMinutes >= 0 covers both +0 and −0 in JS (−0 >= 0 is true),
    // so UTC will always produce "+00:00" rather than the unexpected "−00:00".
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const offsetHH = String(Math.floor(absMinutes / MINUTES_PER_HOUR)).padStart(2, '0');
    const offsetMM = String(absMinutes % MINUTES_PER_HOUR).padStart(2, '0');

    return `${localWallClock}${sign}${offsetHH}:${offsetMM}`;
  } catch {
    // Invalid timezone or unsupported runtime — fall back to UTC ISO string.
    return new Date().toISOString();
  }
}
