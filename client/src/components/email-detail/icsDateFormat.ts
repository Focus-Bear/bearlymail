import { isValidIANATimezone } from 'utils/timezoneUtils';

/**
 * Safely resolves a timezone string to a valid IANA identifier.
 * Windows-style timezone strings (e.g. "AUS Eastern Standard Time") are not
 * valid IANA identifiers and will throw a RangeError if passed to
 * toLocaleString / toLocaleDateString. We discard them and let the browser
 * use its local timezone instead, which is the safest fallback.
 */
function safeTimezone(timezone?: string): string | undefined {
  if (!timezone) {
    return undefined;
  }
  return isValidIANATimezone(timezone) ? timezone : undefined;
}

export function formatDateTime(isoString: string, timezone?: string, allDay?: boolean): string {
  const tz = safeTimezone(timezone);
  if (allDay) {
    return new Date(isoString).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    });
  }
  return new Date(isoString).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: tz,
  });
}
