export const FALLBACK_TIMEZONE = "UTC";

export function normalizeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/**
 * Format a Date as a human-readable date AND time in the given IANA timezone
 * (falling back to UTC when missing or invalid), e.g.
 * "Monday, July 13, 2026 at 10:44 PM GMT+10". Used by LLM prompts that need
 * deadline-proximity awareness — date alone hides that an email about a
 * next-morning event arrived late the night before.
 */
export function formatDateTimeForPrompt(date: Date, timezone?: string): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: normalizeTimezone(timezone || FALLBACK_TIMEZONE),
    timeZoneName: "short",
  });
}

/**
 * Windows timezone name → IANA timezone identifier.
 * Sourced from Unicode CLDR windowsZones.xml (territory "001" default zones).
 * https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml
 */
export const WINDOWS_TO_IANA: Readonly<Record<string, string>> = {
  "AUS Central Standard Time": "Australia/Darwin",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "Afghanistan Standard Time": "Asia/Kabul",
  "Alaskan Standard Time": "America/Anchorage",
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "Arabic Standard Time": "Asia/Baghdad",
  "Argentina Standard Time": "America/Buenos_Aires",
  "Atlantic Standard Time": "America/Halifax",
  "Azerbaijan Standard Time": "Asia/Baku",
  "Azores Standard Time": "Atlantic/Azores",
  "Bahia Standard Time": "America/Bahia",
  "Bangladesh Standard Time": "Asia/Dhaka",
  "Canada Central Standard Time": "America/Regina",
  "Cape Verde Standard Time": "Atlantic/Cape_Verde",
  "Caucasus Standard Time": "Asia/Yerevan",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "Central America Standard Time": "America/Guatemala",
  "Central Asia Standard Time": "Asia/Almaty",
  "Central Brazilian Standard Time": "America/Cuiaba",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Central Pacific Standard Time": "Pacific/Guadalcanal",
  "Central Standard Time": "America/Chicago",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "China Standard Time": "Asia/Shanghai",
  "Dateline Standard Time": "Etc/GMT+12",
  "E. Africa Standard Time": "Africa/Nairobi",
  "E. Australia Standard Time": "Australia/Brisbane",
  "E. Europe Standard Time": "Asia/Nicosia",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Eastern Standard Time": "America/New_York",
  "Eastern Standard Time (Mexico)": "America/Cancun",
  "Egypt Standard Time": "Africa/Cairo",
  "Ekaterinburg Standard Time": "Asia/Yekaterinburg",
  "FLE Standard Time": "Europe/Kiev",
  "Fiji Standard Time": "Pacific/Fiji",
  "GMT Standard Time": "Europe/London",
  "GTB Standard Time": "Europe/Bucharest",
  "Georgian Standard Time": "Asia/Tbilisi",
  "Greenland Standard Time": "America/Godthab",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "India Standard Time": "Asia/Calcutta",
  "Iran Standard Time": "Asia/Tehran",
  "Israel Standard Time": "Asia/Jerusalem",
  "Jordan Standard Time": "Asia/Amman",
  "Kaliningrad Standard Time": "Europe/Kaliningrad",
  "Korea Standard Time": "Asia/Seoul",
  "Libya Standard Time": "Africa/Tripoli",
  "Line Islands Standard Time": "Pacific/Kiritimati",
  "Magadan Standard Time": "Asia/Magadan",
  "Mauritius Standard Time": "Indian/Mauritius",
  "Middle East Standard Time": "Asia/Beirut",
  "Montevideo Standard Time": "America/Montevideo",
  "Morocco Standard Time": "Africa/Casablanca",
  "Mountain Standard Time": "America/Denver",
  "Mountain Standard Time (Mexico)": "America/Chihuahua",
  "Myanmar Standard Time": "Asia/Rangoon",
  "N. Central Asia Standard Time": "Asia/Novosibirsk",
  "Namibia Standard Time": "Africa/Windhoek",
  "Nepal Standard Time": "Asia/Katmandu",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Newfoundland Standard Time": "America/St_Johns",
  "North Asia East Standard Time": "Asia/Irkutsk",
  "North Asia Standard Time": "Asia/Krasnoyarsk",
  "Pacific SA Standard Time": "America/Santiago",
  "Pacific Standard Time": "America/Los_Angeles",
  "Pacific Standard Time (Mexico)": "America/Santa_Isabel",
  "Pakistan Standard Time": "Asia/Karachi",
  "Paraguay Standard Time": "America/Asuncion",
  "Romance Standard Time": "Europe/Paris",
  "Russia Time Zone 10": "Asia/Srednekolymsk",
  "Russia Time Zone 11": "Asia/Kamchatka",
  "Russia Time Zone 3": "Europe/Samara",
  "Russian Standard Time": "Europe/Moscow",
  "SA Eastern Standard Time": "America/Cayenne",
  "SA Pacific Standard Time": "America/Bogota",
  "SA Western Standard Time": "America/La_Paz",
  "SE Asia Standard Time": "Asia/Bangkok",
  "Samoa Standard Time": "Pacific/Apia",
  "Singapore Standard Time": "Asia/Singapore",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Sri Lanka Standard Time": "Asia/Colombo",
  "Syria Standard Time": "Asia/Damascus",
  "Taipei Standard Time": "Asia/Taipei",
  "Tasmania Standard Time": "Australia/Hobart",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Tonga Standard Time": "Pacific/Tongatapu",
  "Turkey Standard Time": "Europe/Istanbul",
  "US Eastern Standard Time": "America/Indiana/Indianapolis",
  "US Mountain Standard Time": "America/Phoenix",
  UTC: "UTC",
  "UTC+12": "Etc/GMT-12",
  "UTC-02": "Etc/GMT+2",
  "UTC-11": "Etc/GMT+11",
  "Ulaanbaatar Standard Time": "Asia/Ulaanbaatar",
  "Venezuela Standard Time": "America/Caracas",
  "Vladivostok Standard Time": "Asia/Vladivostok",
  "W. Australia Standard Time": "Australia/Perth",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "W. Europe Standard Time": "Europe/Berlin",
  "West Asia Standard Time": "Asia/Tashkent",
  "West Pacific Standard Time": "Pacific/Port_Moresby",
  "Yakutsk Standard Time": "Asia/Yakutsk",
};

/**
 * Attempt to map a parenthesised UTC offset string like
 * "(UTC+10:00) Canberra, Melbourne, Sydney" to an IANA timezone.
 *
 * Strategy:
 * 1. Try to match a city name from the description against known IANA zones.
 * 2. Fall back to a fixed-offset Etc/GMT±N identifier.
 *    Note: Etc/GMT signs are inverted (Etc/GMT-10 = UTC+10).
 */
// Half-hour/quarter-hour UTC offsets in minutes → IANA zone
const HALF_HOUR_OFFSET_MAP: Readonly<Record<number, string>> = {
  330: "Asia/Kolkata",
  345: "Asia/Kathmandu",
  390: "Asia/Yangon",
  570: "Australia/Darwin",
  630: "Australia/Adelaide",
  [-210]: "America/St_Johns",
};

// Maximum supported Etc/GMT offset (±14 hours)
const MAX_ETC_GMT_OFFSET = 14;

const MINUTES_PER_HOUR = 60;

function parseUtcOffsetTimezone(raw: string): string | undefined {
  // Extract offset like +10:00, -05:30, +05:30
  const offsetMatch = raw.match(/\(UTC([+-]\d{2}):(\d{2})\)/i);
  if (!offsetMatch) return undefined;

  const sign = offsetMatch[1].startsWith("-") ? -1 : 1;
  const hours = parseInt(offsetMatch[1].replace(/[+-]/, ""), 10);
  const minutes = parseInt(offsetMatch[2], 10);

  // Only whole-hour offsets map cleanly to Etc/GMT (half-hours need specific zones)
  if (minutes !== 0) {
    const totalMinutes = sign * (hours * MINUTES_PER_HOUR + minutes);
    return HALF_HOUR_OFFSET_MAP[totalMinutes];
  }

  // Etc/GMT uses inverted sign convention
  const etcOffset = sign * hours;
  if (Math.abs(etcOffset) > MAX_ETC_GMT_OFFSET) return undefined;
  if (etcOffset === 0) return "UTC";
  return `Etc/GMT${etcOffset > 0 ? "-" : "+"}${Math.abs(etcOffset)}`;
}

/**
 * Map a raw ICS TZID string to a valid IANA timezone identifier.
 *
 * Resolution order:
 * 1. Already a valid IANA timezone → return as-is.
 * 2. Windows timezone name in WINDOWS_TO_IANA map → return mapped value.
 * 3. Parenthesised UTC offset format → parse to Etc/GMT or known zone.
 * 4. Fallback → return "UTC" and log a warning.
 *
 * This function never throws.
 */
export function mapToIANATimezone(rawTz: string): string {
  if (!rawTz || !rawTz.trim()) {
    return FALLBACK_TIMEZONE;
  }

  const trimmed = rawTz.trim();

  // Step 1: Already valid IANA?
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    // Not a valid IANA zone — continue to mapping
  }

  // Step 2: Windows timezone map lookup
  const mapped = WINDOWS_TO_IANA[trimmed];
  if (mapped) {
    return mapped;
  }

  // Step 3: Parenthesised UTC offset format
  if (trimmed.startsWith("(UTC")) {
    const offsetMapped = parseUtcOffsetTimezone(trimmed);
    if (offsetMapped) {
      return offsetMapped;
    }
  }

  // Step 4: Fallback to UTC with warning
  console.warn(
    `[timezone] Unknown ICS timezone "${trimmed}" — falling back to UTC. ` +
      `Consider adding this to WINDOWS_TO_IANA.`,
  );
  return FALLBACK_TIMEZONE;
}
