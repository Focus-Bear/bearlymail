/**
 * Helpers for converting LLM-extracted meeting proposals from a naive local
 * wall-clock time + timezone into a deterministic UTC ISO string.
 *
 * Why a code-side conversion?
 *
 * LLMs are unreliable at applying timezone offsets — especially when given an
 * IANA timezone name (e.g. "Australia/Melbourne") rather than an abbreviation,
 * and when accounting for DST on a specific future date. To make scheduled
 * meeting times correct regardless of LLM reliability, the prompts now return
 * the meeting time as the wall-clock time exactly as it would appear on a
 * calendar invite (e.g. "2026-06-09T11:00:00") together with the timezone the
 * sender intended (IANA name when known, otherwise a fixed offset such as
 * "UTC-5"). Code does the actual offset math via Luxon.
 */

import { DateTime } from "luxon";

/**
 * Convert a naive local wall-clock datetime + timezone into a UTC ISO string.
 *
 * Accepts:
 *   - localTime: ISO-8601-ish datetime WITHOUT timezone offset (e.g. "2026-06-09T11:00:00").
 *     A trailing "Z" or "+HH:MM" offset will cause the zone arg to be IGNORED
 *     by Luxon — strip any such suffix before calling if you want the zone to apply.
 *   - timezone: an IANA timezone name (e.g. "Australia/Melbourne", "America/New_York")
 *     or a fixed UTC offset specifier accepted by Luxon (e.g. "UTC", "UTC+10",
 *     "UTC-5", "UTC+5:30").
 *
 * Returns the UTC ISO string (e.g. "2026-06-09T01:00:00.000Z") or null if either
 * input is missing/invalid.
 */
export function convertLocalTimeInZoneToUtc(
  localTime: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!localTime || !timezone) return null;

  // Strip any trailing offset/Z so Luxon respects the explicit `zone`.
  // (Luxon ignores `zone` when the input string already carries an offset.)
  const naive = localTime.replace(/(Z|[+-]\d{2}(?::?\d{2})?)$/i, "");

  const dt = DateTime.fromISO(naive, { zone: timezone, setZone: true });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}
