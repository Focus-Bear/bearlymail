# Plan: #1167 — App crashes when opening email with calendar event

## Revised Root Cause (Updated)

The crash is **NOT** primarily an ICS-specific bug. The browser console reveals:

```
Uncaught error in component: RangeError: Invalid time zone specified: AUS Eastern Standard Time
  at Date.toLocaleString (<anonymous>)
```

A **Windows-style timezone string** (`"AUS Eastern Standard Time"`) has been stored in the user's
`batch_schedules.timezone` column. When `getCurrentTimeInTimezone("AUS Eastern Standard Time")` is
called from `useEmailDetailToneCheck` or `useEmailDetailOperations` (both hooks run on *any* email
detail view, including ICS emails), it passes the Windows tz string to `new Intl.DateTimeFormat(…,
{ timeZone: "AUS Eastern Standard Time" })`, which throws `RangeError: Invalid time zone specified`.

The `try/catch` in `getCurrentTimeInTimezone` **should** catch this — but the current production
build (PR #1147, merged 2026-03-17) uses `new Intl.DateTimeFormat` in the try block. The `RangeError`
is indeed thrown *inside* the try block, so it *should* be caught. However, the error propagates to
the React tree as an **uncaught component error**, crashing the ErrorBoundary, because:

- `useEmailDetailToneCheck` / `useEmailDetailOperations` call `getCurrentTimeInTimezone` inside a
  `useEffect` callback that is invoked *during rendering* — and unhandled Promise rejections or
  synchronous throws inside effects can propagate to React's error boundary.

Regardless of where the catch-miss is, the **root cause** is Windows timezone strings in the DB.

### Why "ICS emails" specifically?

ICS calendar invite emails may disproportionately come from calendar systems (Exchange, Outlook,
Google Workspace) that register users in timezone-aware ways. A user who originally set up their
account via an Outlook calendar flow may have had their timezone stored as a Windows identifier
(`"AUS Eastern Standard Time"`) rather than IANA (`"Australia/Sydney"`). The crash happens on *any*
email detail view, but the bug was reported in the context of ICS emails.

### Code paths involved

1. **`client/src/hooks/useEmailDetailToneCheck.ts` (line 34)**
   - Fetches `GET /batch-schedule`, stores `res.data?.timezone` in `timezoneRef.current`
   - Calls `getCurrentTimeInTimezone(timezoneRef.current)` on line 45

2. **`client/src/hooks/useEmailDetailOperations.ts` (line 223)**
   - Same pattern — fetches `/batch-schedule`, stores in `timezoneRef.current`
   - Calls `getCurrentTimeInTimezone(timezoneRef.current)` on line 804

3. **`client/src/utils/timezoneUtils.ts` — `getCurrentTimeInTimezone()`**
   - Has try/catch but needs an explicit IANA validation guard *before* calling `Intl.DateTimeFormat`
   - The existing test `'returns a UTC ISO string for an invalid timezone'` only tests `'Not/A/Timezone'`
     — a Windows-style string with spaces and no slashes was never tested

4. **`server/src/batch-schedule/batch-schedule.service.ts` — `upsertSchedule()`**
   - Stores `scheduleData.timezone` directly into the DB without validating it's a valid IANA tz
   - No server-side normalization or Windows→IANA mapping

5. **`server/src/scheduling-preferences/scheduling-preferences.service.ts`**
   - Same issue: stores `prefs.timezone` directly from client without validation

---

## Fix Plan

### Fix 1 — `timezoneUtils.ts`: Add explicit IANA validation guard (client, immediate)

**File:** `client/src/utils/timezoneUtils.ts`

Add a helper `isValidIANATimezone(tz: string): boolean` that validates a timezone string before
passing it to `Intl.DateTimeFormat`. Use `Intl.supportedValuesOf('timeZone')` (with try/catch
fallback for older runtimes) as the validation source.

```typescript
function isValidIANATimezone(tz: string): boolean {
  try {
    // Intl.supportedValuesOf is available in all modern browsers/Node.
    // On older runtimes, fall through to the constructor probe.
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').includes(tz);
    }
  } catch {
    // Intl.supportedValuesOf threw — fall through to constructor probe
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
```

In `getCurrentTimeInTimezone`, call this guard early and return `new Date().toISOString()` for
non-IANA strings:

```typescript
export function getCurrentTimeInTimezone(timezone?: string): string {
  if (!timezone || !isValidIANATimezone(timezone)) {
    return new Date().toISOString();
  }
  // ... existing Intl.DateTimeFormat logic ...
}
```

**Tests to add to `client/src/utils/timezoneUtils.test.ts`:**
- `'returns a UTC ISO string for a Windows-style timezone ("AUS Eastern Standard Time")'`
- `'returns a UTC ISO string for "Eastern Standard Time"'`
- `'returns a UTC ISO string for timezone strings with spaces'`

### Fix 2 — Server: IANA validation on write in `batch-schedule.service.ts`

**File:** `server/src/batch-schedule/batch-schedule.service.ts`

Add a server-side `isValidIANATimezone(tz: string): boolean` helper (using `Intl.DateTimeFormat`
constructor probe — Node.js ≥12 supports it). In `upsertSchedule`, normalize the incoming timezone
before persisting:

```typescript
private isValidIANATimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
```

In `upsertSchedule`:
```typescript
const safeTimezone = this.isValidIANATimezone(scheduleData.timezone)
  ? scheduleData.timezone
  : 'UTC';
```

Apply `safeTimezone` instead of `scheduleData.timezone` when writing to the entity.

**Tests to add to `batch-schedule.service.spec.ts` (or new spec file):**
- `'upsertSchedule falls back to UTC for Windows-style timezone strings'`
- `'upsertSchedule preserves valid IANA timezone'`

### Fix 3 — Server: Same validation in `scheduling-preferences.service.ts`

**File:** `server/src/scheduling-preferences/scheduling-preferences.service.ts`

Same pattern — add the `isValidIANATimezone` guard (or extract to a shared `timezone.utils.ts`
helper in `server/src/utils/`) and normalize on `updatePreferences`.

### Fix 4 — Server: `GET /batch-schedule` — sanitize on read (defence-in-depth)

**File:** `server/src/batch-schedule/batch-schedule.controller.ts` (or service)

When returning the schedule to the client, sanitize the `timezone` field:

```typescript
const tz = schedule.timezone;
return {
  ...schedule,
  timezone: this.isValidIANATimezone(tz) ? tz : 'UTC',
};
```

This handles existing users whose `batch_schedules` rows already have Windows timezone strings in the
DB, without requiring a migration.

---

## Files to Change

| File | Change |
|------|--------|
| `client/src/utils/timezoneUtils.ts` | Add `isValidIANATimezone()` guard; call before `Intl.DateTimeFormat` |
| `client/src/utils/timezoneUtils.test.ts` | Add Windows-tz test cases |
| `server/src/batch-schedule/batch-schedule.service.ts` | Validate/normalize `timezone` on `upsertSchedule` |
| `server/src/batch-schedule/batch-schedule.controller.ts` | Sanitize timezone on `GET /batch-schedule` response |
| `server/src/scheduling-preferences/scheduling-preferences.service.ts` | Validate/normalize `timezone` on `updatePreferences` |

Optional (shared helper, reduces duplication):
| `server/src/utils/timezone.utils.ts` | New file: `isValidIANATimezone(tz: string): boolean` |

---

## What NOT to Change

- **No DB migration needed.** The on-read sanitization in Fix 4 handles existing rows.
- **No Windows→IANA mapping table needed.** Falling back to UTC is safer and simpler than mapping.
  A Windows tz string means the user's settings are corrupted; UTC is a safe default until they
  re-set their timezone in the Settings UI (which uses `TimezoneAutocomplete`, IANA-only).
- **`IcsInviteCard.tsx` / ICS parser** — these do not need changes for this issue.
  PR #1107 and #1134 already hardened the ICS path. The crash was timezone-related, not ICS-specific.

---

## Related PRs

- #1107 (merged) — ICS parsing error handling (not root cause of #1167)
- #1134 (merged) — Axios error type safety in IcsInviteCard (not root cause of #1167)
- #1147 (merged) — `getCurrentTimeInTimezone` implementation (introduced the code path that crashes)
- #1163 (merged) — `timezoneUtils.ts` test comment improvements (no logic change)

---

*Plan authored by Monk of Modularity (AI agent).*
