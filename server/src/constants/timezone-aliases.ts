/**
 * Places and abbreviations people write next to a meeting time ("11.30am (Fremantle time)",
 * "2pm AEST", "10am in Sydney"), mapped to a zone Luxon understands.
 *
 * Abbreviations map to fixed offsets — the abbreviation already says whether daylight saving is in
 * force, and this matches the table in the detect-meeting-proposal prompt. Place names map to IANA
 * zones so the offset follows daylight saving on the proposed date.
 *
 * Keys are lowercase; lookups are case-insensitive.
 */
export const TIMEZONE_ALIASES: Readonly<Record<string, string>> = {
  // Australia — places
  perth: "Australia/Perth",
  fremantle: "Australia/Perth",
  wa: "Australia/Perth",
  "western australia": "Australia/Perth",
  adelaide: "Australia/Adelaide",
  "south australia": "Australia/Adelaide",
  darwin: "Australia/Darwin",
  brisbane: "Australia/Brisbane",
  queensland: "Australia/Brisbane",
  qld: "Australia/Brisbane",
  sydney: "Australia/Sydney",
  canberra: "Australia/Sydney",
  nsw: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  victoria: "Australia/Melbourne",
  vic: "Australia/Melbourne",
  hobart: "Australia/Hobart",
  tasmania: "Australia/Hobart",
  // Australia — abbreviations
  awst: "UTC+8",
  acst: "UTC+9:30",
  acdt: "UTC+10:30",
  aest: "UTC+10",
  aedt: "UTC+11",
  // New Zealand and Asia
  auckland: "Pacific/Auckland",
  wellington: "Pacific/Auckland",
  "new zealand": "Pacific/Auckland",
  nz: "Pacific/Auckland",
  nzst: "UTC+12",
  nzdt: "UTC+13",
  singapore: "Asia/Singapore",
  ist: "UTC+5:30",
  // Europe
  london: "Europe/London",
  uk: "Europe/London",
  gmt: "UTC",
  utc: "UTC",
  bst: "UTC+1",
  cet: "UTC+1",
  cest: "UTC+2",
  // North America
  "new york": "America/New_York",
  toronto: "America/Toronto",
  eastern: "America/New_York",
  chicago: "America/Chicago",
  central: "America/Chicago",
  denver: "America/Denver",
  mountain: "America/Denver",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  vancouver: "America/Vancouver",
  pacific: "America/Los_Angeles",
  est: "UTC-5",
  edt: "UTC-4",
  cst: "UTC-6",
  cdt: "UTC-5",
  mst: "UTC-7",
  mdt: "UTC-6",
  pst: "UTC-8",
  pdt: "UTC-7",
};

/** IANA prefix of zones whose writers use month-first numeric dates (11/12 = 12 November). */
export const MONTH_FIRST_DATE_ZONE_PREFIX = "America/";
