# [PLANNING] fix: ICS invite card — missing title + calendar duplicate detection

## Bug 1: Event title shows "(No title)" instead of actual SUMMARY

### Root Cause

**File:** `server/src/calendar/calendar-ics-parser.ts`, line 145

```ts
const title =
  typeof extEntry.summary === "string" ? extEntry.summary : "(No title)";
```

When an ICS file contains `SUMMARY;LANGUAGE=en-US:Focus Bear x RMIT Investment Team`, the `node-ical` library parses this as an object: `{ val: "Focus Bear x RMIT Investment Team", params: { LANGUAGE: "en-US" } }` — not a bare string. The `typeof === "string"` check fails, falling through to `"(No title)"`.

### Fix

Replace line 145 with:

```ts
const title = extractStringValue(extEntry.summary) ?? "(No title)";
```

The `extractStringValue()` helper already exists on branch `openclaw/fix-1285-ics-import` (commit `2bd65cdf`). It handles both bare strings and `{ val }` objects:

```ts
export function extractStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && "val" in value) {
    const val = (value as { val: unknown }).val;
    return typeof val === "string" ? val : undefined;
  }
  return undefined;
}
```

This function must also be applied to the `description` and `location` fields (lines 148-152) for consistency.

---

## Bug 2: Calendar duplicate detection fails — always shows "Add to Calendar"

### Root Cause

**File:** `server/src/calendar/calendar.service.ts`, `checkEventExists()` method (line 625)

Two compounding issues:

1. **Downstream of Bug 1:** `checkEventExists()` uses `q: eventData.title` (line 648) as a Google Calendar full-text search parameter. When Bug 1 causes the title to be `"(No title)"`, the search returns no results → `exists: false` → the button says "Add to Calendar" even though the event is already there.

2. **Fragile matching strategy:** Even with a correct title, the `q:` full-text search is unreliable — it matches substrings, can miss events, and produces false positives. The authoritative way to check for duplicate ICS events is by `iCalUID`, which Google Calendar's events.list API supports directly.

### Fix

Replace the `q:` search approach with `iCalUID`-based matching (already implemented on `openclaw/fix-1285-ics-import`, commit `0e5d1395`):

```ts
// Priority 1: Match by iCalUID (authoritative)
if (eventData.uid) {
  const response = await calendar.events.list({
    calendarId: "primary",
    iCalUID: eventData.uid,
    singleEvents: true,
  });
  const match = (response.data.items ?? [])[0];
  if (match) {
    return {
      exists: true,
      calendarEventId: match.id,
      htmlLink: match.htmlLink,
    };
  }
}

// Priority 2: Fallback — exact title + time proximity
const response = await calendar.events.list({
  calendarId: "primary",
  timeMin: new Date(startMs - FIVE_MINUTES_MS).toISOString(),
  timeMax: new Date(startMs + FIVE_MINUTES_MS).toISOString(),
  singleEvents: true,
});
const match = (response.data.items ?? []).find((ev) => {
  const evStart = ev.start?.dateTime ?? ev.start?.date;
  if (!evStart) return false;
  const diff = Math.abs(new Date(evStart).getTime() - startMs);
  return diff <= FIVE_MINUTES_MS && ev.summary === eventData.title;
});
```

Also accept an optional `preloadedUser` parameter to avoid redundant DB lookups when called from `addIcsEventToCalendar`.

---

## Implementation Notes

- Both fixes already exist on branch `openclaw/fix-1285-ics-import` (commits `2bd65cdf` and `0e5d1395`). The simplest path is to merge or cherry-pick that branch.
- If that branch has other changes that shouldn't land yet, cherry-pick just these two commits.
- All tests on that branch pass (102 calendar tests, zero lint errors per commit message).

## Files to Modify

1. `server/src/calendar/calendar-ics-parser.ts` — add `extractStringValue()`, use it for `summary`, `description`, `location`
2. `server/src/calendar/calendar.service.ts` — rewrite `checkEventExists()` to use `iCalUID` matching with title+time fallback
3. `server/src/calendar/calendar-ics-parser.spec.ts` — add test for LANGUAGE-parameterized SUMMARY
4. `server/src/calendar/calendar.service.spec.ts` — update checkEventExists tests for iCalUID path

🤖 Monk of Modularity [AI investigator]
