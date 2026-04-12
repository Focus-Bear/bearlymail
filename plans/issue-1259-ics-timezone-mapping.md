# Plan: Fix ICS timezone mapping for Google Calendar API (#1259)

**Issue:** #1259 — ICS calendar save fails with "Invalid time zone definition for start/end time"
**Priority:** P2
**Author:** monk-of-modularity[bot]

---

## Problem

When a user saves an ICS calendar invite to Google Calendar via `addIcsEventToCalendar()`, the Google Calendar API rejects the request with:

> "Invalid time zone definition for start/end time"

This happens because non-standard timezone strings from ICS files (e.g. Windows-style `AUS Eastern Standard Time`, `Eastern Standard Time`, or custom VTIMEZONE identifiers like `(UTC+10:00) Canberra, Melbourne, Sydney`) are passed **directly** to Google Calendar's `timeZone` field, which requires valid IANA timezone identifiers (e.g. `Australia/Sydney`, `America/New_York`).

## History

This issue has been partially addressed multiple times:

1. **#1167/#1169** — Fixed frontend crash when Windows timezone strings hit `toLocaleString()` in email detail view. Added `normalizeTimezone()` utility (server) and `isValidIANATimezone()` (client).
2. **#1193/#1195** — Fixed frontend crash in `IcsInviteCard.tsx` by adding `safeTimezone()` guard. Client-side only.
3. **#1197/#1200** — Fixed OAuth2 singleton race, all-day end-date off-by-one, and improved error logging in `addIcsEventToCalendar()`. Did NOT address timezone mapping.
4. **#1210/#1211** — Added error logging before the 500 response.

**None of these fixed the server-side timezone mapping.** The parser extracts the raw TZID string from the ICS and passes it straight to Google Calendar.

## Root Cause Analysis

### Data flow (current):

```
ICS file
  → calendar-ics-parser.ts: parseIcsStringSafe()
    → regex: /DTSTART;TZID=([^:]+):/i → extracts raw TZID string
    → stores as eventData.timezone (e.g. "AUS Eastern Standard Time")
  → calendar.service.ts: addIcsEventToCalendar()
    → passes eventData.timezone directly to Google Calendar API:
       start: { dateTime: ..., timeZone: eventData.timezone ?? "UTC" }
    → Google rejects non-IANA timezone → 400 error
```

### Where it breaks:

1. **`calendar-ics-parser.ts` line ~120**: `const timezone = tzidMatch ? tzidMatch[1] : undefined;` — raw TZID extracted, no validation or mapping.
2. **`calendar.service.ts` line ~310**: `timeZone: eventData.timezone ?? "UTC"` — passed directly to Google API without validation.

### Existing utilities NOT used in this flow:

- **Server:** `server/src/utils/timezone.utils.ts` has `normalizeTimezone()` that validates via `Intl.DateTimeFormat` and falls back to UTC. **Not imported by calendar-ics-parser.ts or calendar.service.ts.**
- **Client:** `client/src/utils/timezoneUtils.ts` has `isValidIANATimezone()`. Client-side only.

## Fix Plan

### Step 1: Enhance `server/src/utils/timezone.utils.ts`

Add a `mapToIANATimezone(rawTz: string): string` function that:

1. **Check if already valid IANA** — use existing `normalizeTimezone()` logic (`Intl.DateTimeFormat` test). If valid, return as-is.
2. **Windows → IANA mapping** — maintain a lookup map of common Windows timezone names to IANA equivalents. This covers the most common case (Outlook/Exchange ICS files). Use a static map based on the [Unicode CLDR windowsZones.xml](https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml) data. Include at minimum:
   - `AUS Eastern Standard Time` → `Australia/Sydney`
   - `Eastern Standard Time` → `America/New_York`
   - `Pacific Standard Time` → `America/Los_Angeles`
   - `Central Standard Time` → `America/Chicago`
   - `Mountain Standard Time` → `America/Denver`
   - `GMT Standard Time` → `Europe/London`
   - `W. Europe Standard Time` → `Europe/Berlin`
   - `Tokyo Standard Time` → `Asia/Tokyo`
   - `China Standard Time` → `Asia/Shanghai`
   - `India Standard Time` → `Asia/Kolkata`
   - `Romance Standard Time` → `Europe/Paris`
   - `Central European Standard Time` → `Europe/Warsaw`
   - `E. South America Standard Time` → `America/Sao_Paulo`
   - ... (full list: ~100 entries from CLDR, include ALL of them)
3. **Parenthesised UTC offset format** — some ICS files use `(UTC+10:00) Canberra, Melbourne, Sydney`. Extract the UTC offset and attempt to map to a canonical IANA zone, or fall back to a fixed-offset identifier like `Etc/GMT-10` (note: Etc/GMT signs are inverted).
4. **Fallback to UTC** — if no mapping found, return `"UTC"` and log a warning with the unmapped timezone string so we can add it to the map later.

### Step 2: Apply mapping in `calendar-ics-parser.ts`

In `buildEventResult()`, after extracting the raw TZID:

```typescript
import { mapToIANATimezone } from "../utils/timezone.utils";

// Current:
const timezone = tzidMatch ? tzidMatch[1] : undefined;

// New:
const rawTimezone = tzidMatch ? tzidMatch[1] : undefined;
const timezone = rawTimezone ? mapToIANATimezone(rawTimezone) : undefined;
```

This ensures that `IcsEventData.timezone` always contains a valid IANA timezone or `undefined`.

### Step 3: Defensive validation in `addIcsEventToCalendar()`

As a belt-and-suspenders measure, validate the timezone before passing to Google:

```typescript
import { normalizeTimezone } from "../utils/timezone.utils";

// In the eventBody construction:
const safeTimezone = normalizeTimezone(eventData.timezone ?? "UTC");

start: { dateTime: eventData.startAt, timeZone: safeTimezone },
end: { dateTime: eventData.endAt ?? eventData.startAt, timeZone: safeTimezone },
```

This catches any edge case where a non-IANA string slips through the parser.

### Step 4: Tests

Add to existing test files:

**`server/src/utils/timezone.utils.spec.ts`** (new file):

- `mapToIANATimezone("America/New_York")` → `"America/New_York"` (passthrough)
- `mapToIANATimezone("AUS Eastern Standard Time")` → `"Australia/Sydney"`
- `mapToIANATimezone("Eastern Standard Time")` → `"America/New_York"`
- `mapToIANATimezone("(UTC+10:00) Canberra, Melbourne, Sydney")` → mapped correctly
- `mapToIANATimezone("Totally Fake Timezone")` → `"UTC"` (fallback)
- `mapToIANATimezone("")` → `"UTC"`

**`server/src/calendar/calendar-ics-parser.spec.ts`** (add cases):

- ICS with `DTSTART;TZID=AUS Eastern Standard Time:20240315T100000` → `event.timezone === "Australia/Sydney"`
- ICS with `DTSTART;TZID=Eastern Standard Time:20240315T100000` → `event.timezone === "America/New_York"`
- ICS with valid IANA TZID → unchanged

**`server/src/calendar/calendar.service.spec.ts`** (add case):

- Mock `addIcsEventToCalendar()` with a Windows timezone string → confirm Google API is called with IANA timezone

### Step 5: No new dependencies

The fix uses only:

- `Intl.DateTimeFormat` (built-in) for IANA validation
- A static map for Windows → IANA mapping (no npm package needed)
- Existing `normalizeTimezone()` utility

`luxon` and `node-ical` are already in the project but neither is needed for this fix. A static map is more predictable and has zero runtime cost compared to pulling in `windows-iana` or `moment-timezone` just for this mapping.

## Files to modify

| File                                              | Change                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `server/src/utils/timezone.utils.ts`              | Add `WINDOWS_TO_IANA` map, `mapToIANATimezone()`, `parseUtcOffsetTimezone()` |
| `server/src/calendar/calendar-ics-parser.ts`      | Import `mapToIANATimezone`, apply to extracted TZID                          |
| `server/src/calendar/calendar.service.ts`         | Import `normalizeTimezone`, validate timezone before Google API call         |
| `server/src/utils/timezone.utils.spec.ts`         | New file — unit tests for mapping                                            |
| `server/src/calendar/calendar-ics-parser.spec.ts` | Add Windows timezone test cases                                              |
| `server/src/calendar/calendar.service.spec.ts`    | Add timezone validation test case                                            |

## Risk assessment

- **Low risk** — the mapping is additive (valid IANA timezones pass through unchanged)
- **Fallback to UTC** ensures no regression even for unknown timezone strings
- **Warning logging** on fallback helps us discover unmapped timezones in production
- **No new dependencies** — static map, built-in APIs only

## Acceptance criteria

1. ICS files with Windows-style timezone strings (e.g. from Outlook/Exchange) save successfully to Google Calendar
2. ICS files with standard IANA timezones continue to work unchanged
3. Unknown/unmappable timezone strings fall back to UTC (not crash)
4. A warning is logged when timezone fallback occurs (for monitoring)
5. All new and existing calendar-related tests pass
