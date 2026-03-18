export const FALLBACK_TIMEZONE = "UTC";

export function normalizeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}
