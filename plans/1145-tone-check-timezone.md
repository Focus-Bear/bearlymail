# Plan: fix(#1145) — Use user timezone in tone check timing note

## Issue Summary

**Bug:** The tone check timing note displays UTC time instead of the user's configured timezone.  
**Symptom:** "Current time is 22:33 (late evening)" shown when the user's actual local time is 9:33am (Australia/Melbourne).  
**Root cause:** `new Date().toISOString()` always returns UTC. The `currentTime` sent to the server LLM prompt is in UTC, so the LLM evaluates timing against UTC hours — not the user's local hours.

---

## Investigation Findings

### Where the bug lives

Two call sites both create `currentTime` using bare `new Date().toISOString()` (UTC):

| File                                           | Line | Code                                            |
| ---------------------------------------------- | ---- | ----------------------------------------------- |
| `client/src/hooks/useEmailDetailToneCheck.ts`  | 32   | `const currentTime = new Date().toISOString();` |
| `client/src/hooks/useEmailDetailOperations.ts` | 785  | `currentTime: new Date().toISOString(),`        |

Both pass this UTC timestamp to `POST /llm/check-tone` as `{ currentTime, ... }`.

### How the server uses `currentTime`

The server `LLMController.checkTone()` passes `body.currentTime` directly to `LLMService.checkTone()`, which injects it verbatim into the prompt template:

```
// server/promptfoo/prompts/check-tone-style.md
Current local time (ISO 8601): {{currentTime}}
```

The LLM then interprets "Current local time" as the user's local time — but the value is actually UTC. This is what causes the bug: the LLM faithfully does what the prompt says ("evaluate timing using this local time") but the value is wrong.

### Where the user's timezone is stored

The user's timezone is stored in the `BatchSchedule` entity as `timezone: string` (IANA format, e.g. `"Australia/Melbourne"`).

On the client, it is loaded via:

- `client/src/hooks/settings/useBatchSchedule.ts` → `batchSchedule.timezone`
- Available throughout the settings page via `useSettingsData`

**However**, it is NOT currently accessible in the tone check hooks:

- `useEmailDetailToneCheck` and `useEmailDetailOperations` do not receive or reference `batchSchedule`.

### The fix approach

The `currentTime` value passed to the server should represent the **local time in the user's configured timezone**. The LLM only needs an ISO 8601 string representing the local moment — it doesn't need a timezone offset, but the hour must reflect the user's local hour.

**Correct approach:** use `Intl.DateTimeFormat` with the user's timezone to determine the local hour offset, then produce an ISO 8601 string with the correct local time.

---

## Fix Plan

### Step 1 — Create a timezone utility helper

**File:** `client/src/utils/timezoneUtils.ts` (new file)

```ts
/**
 * Returns an ISO 8601 datetime string representing "now" in the given IANA timezone.
 * The returned string has no UTC offset so the LLM reads it as local time.
 *
 * @param timezone - IANA timezone name (e.g. "Australia/Melbourne"). Falls back to
 *                   the browser's local timezone if omitted or invalid.
 */
export function getCurrentTimeInTimezone(timezone?: string): string {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    // Format the current moment as a local ISO-like string in the given timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // en-CA gives us YYYY-MM-DD; combine with time parts
    const parts = formatter.formatToParts(new Date());
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    // If the timezone is invalid, fall back to browser local
    return new Date().toLocaleString("sv").replace(" ", "T");
  }
}
```

### Step 2 — Thread timezone through `useEmailDetailToneCheck`

**File:** `client/src/hooks/useEmailDetailToneCheck.ts`

Change `checkTone` signature to accept an optional `timezone` parameter:

```ts
// Before
const checkTone = useCallback(async (draft: string, scheduledSendAt?: string | null): Promise<boolean> => {
  ...
  const currentTime = new Date().toISOString();

// After
const checkTone = useCallback(async (
  draft: string,
  scheduledSendAt?: string | null,
  timezone?: string,
): Promise<boolean> => {
  ...
  const currentTime = getCurrentTimeInTimezone(timezone);
```

Also update the exported hook type if it exists.

### Step 3 — Thread timezone through `useEmailDetailOperations.ts`

**File:** `client/src/hooks/useEmailDetailOperations.ts`

This hook calls `POST /llm/check-tone` directly (not via `useEmailDetailToneCheck`). It also needs to use the timezone-aware helper:

```ts
// Before
currentTime: new Date().toISOString(),

// After
currentTime: getCurrentTimeInTimezone(batchSchedule?.timezone),
```

`useEmailDetailOperations` will need to receive `batchSchedule.timezone` from its call site. Audit the call chain to confirm where `batchSchedule` is available and thread it down, or access it via a shared context/hook.

### Step 4 — Pass timezone from call sites

**Files to update:**

- `client/src/hooks/useEmailDetailReplies.ts` — calls `checkTone(draft, scheduledSendAt)`, needs to pass `timezone`
- `client/src/pages/Compose.tsx` — calls `checkTone(form.body.trim())`, needs to pass `timezone`

In both cases, the `batchSchedule.timezone` must be available. Options:

**Option A (preferred):** Load `batchSchedule` in `useEmailDetailToneCheck` itself by calling `GET /batch-schedule` once on mount (or use a shared state/context). This keeps all the complexity in one place and avoids threading timezone through many layers.

**Option B:** Thread `timezone?: string` as a prop/parameter down through the call chain from wherever `batchSchedule` is available.

**Recommendation: Option A** — add a one-time `GET /batch-schedule` fetch inside `useEmailDetailToneCheck` on mount, store the timezone, and use it in `getCurrentTimeInTimezone`. This is the smallest-footprint change.

```ts
// useEmailDetailToneCheck.ts additions:
const [userTimezone, setUserTimezone] = useState<string>(
  Intl.DateTimeFormat().resolvedOptions().timeZone,
);

useEffect(() => {
  axios
    .get(`${API_URL}/batch-schedule`)
    .then((res) => {
      if (res.data?.timezone) setUserTimezone(res.data.timezone);
    })
    .catch(() => {
      /* silently fall back to browser timezone */
    });
}, []);
```

Then use `userTimezone` in `getCurrentTimeInTimezone(userTimezone)`.

Do the same in `useEmailDetailOperations.ts` if it's not refactored to delegate to `useEmailDetailToneCheck`.

### Step 5 — Add unit tests

**File:** `client/src/utils/timezoneUtils.test.ts` (new file)

Test cases:

- Returns a string with correct local hour for `Australia/Melbourne` vs UTC (use a fixed mock `Date`)
- Falls back to browser timezone for invalid/empty timezone
- Output format is ISO 8601 without timezone offset suffix

**File:** `client/src/hooks/useEmailDetailToneCheck.test.ts` (new or update existing)

Test cases:

- When batch schedule timezone is `Australia/Melbourne`, `currentTime` sent to the API uses Melbourne local time, not UTC
- When batch schedule is unavailable, falls back to browser timezone

---

## Files to Change

| File                                           | Change                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `client/src/utils/timezoneUtils.ts`            | **New** — `getCurrentTimeInTimezone(timezone?)` helper                           |
| `client/src/utils/timezoneUtils.test.ts`       | **New** — unit tests for helper                                                  |
| `client/src/hooks/useEmailDetailToneCheck.ts`  | Fetch user timezone on mount; use `getCurrentTimeInTimezone`                     |
| `client/src/hooks/useEmailDetailOperations.ts` | Replace `new Date().toISOString()` with `getCurrentTimeInTimezone(userTimezone)` |
| `client/src/hooks/useEmailDetailReplies.ts`    | Pass timezone to `checkTone` if signature changes                                |
| `client/src/pages/Compose.tsx`                 | Pass timezone to `checkTone` if signature changes                                |

**Server-side changes: NONE required.**  
The LLM prompt already says "Current local time" and interprets it correctly once the client sends the right value. No server prompt changes needed.

---

## Edge Cases

1. **User has no batch schedule yet:** Fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser timezone). This is already the default in `useBatchSchedule`.
2. **Batch schedule fetch fails:** Same fallback to browser timezone; tone check still works, just uses browser local time.
3. **Invalid IANA timezone string in DB:** `getCurrentTimeInTimezone` catches the error and falls back to browser timezone.
4. **`scheduledSendAt` is set:** When the user has scheduled a send, the server uses `scheduledSendAt` (not `currentTime`) to evaluate timing, per the existing prompt logic. No change needed here — the bug only affects immediate sends where `currentTime` is used.

---

## Testing Checklist

- [ ] User in `Australia/Melbourne` (UTC+10/+11): tone check at 9:33am should NOT show a late-night warning
- [ ] User in `Australia/Melbourne`: tone check at 22:33 local time SHOULD show a late-night warning
- [ ] User with no batch schedule set: falls back to browser timezone gracefully
- [ ] Scheduled sends: `scheduledSendAt` path unaffected
- [ ] Unit tests pass for `timezoneUtils.ts`
- [ ] No regression in Compose.tsx tone check flow

---

_Plan by Monk of Modularity (OpenClaw agent) for issue #1145_
