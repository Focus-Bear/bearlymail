# Plan: #808 — Calendar booking improvements

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/808

---

## Problem Analysis

Two issues with the booking page (`/book/:userId`):

1. **"Load more dates" is not working** — clicking the button fetches more data but does not append new slots to the list; it replaces them.
2. **Google Meet link not auto-added** — when booking via Google Calendar, a Meet link should be automatically created and included in the calendar event.

---

## Root Cause

### Bug 1: Load more dates doesn't append

**File:** `client/src/pages/BookingPage.tsx`

The `fetchSlots` function has an `append` parameter but both branches do the same thing:

```typescript
const fetchSlots = async (days: number, append = false) => {
  // ...
  if (append) {
    setSlots(response.data.slots);  // ← BUG: should be setSlots(prev => [...prev, ...response.data.slots])
  } else {
    setSlots(response.data.slots);
  }
};
```

The `append` branch should merge the new slots with existing ones, not replace them.

Additionally, the API call for "load more" may be fetching ALL slots for `daysAhead` days, which includes the already-shown slots. The fix needs to either:
- Fetch only the new window of slots (e.g., from day 30 to day 60), OR
- Fetch all slots up to `newDaysAhead` and merge/deduplicate.

The simpler fix: send a `startDaysAhead` param to only fetch new slots, or deduplicate by slot start time when appending.

### Bug 2: No Google Meet link

**File:** `server/src/calendar/calendar.service.ts`

When creating a Google Calendar event for a booking, the `conferenceData` field is not being set. Google Calendar API supports `conferenceData.createRequest` to auto-create a Meet link.

---

## Implementation Steps

### Fix 1: Load more dates — frontend

**File:** `client/src/pages/BookingPage.tsx`

**Option A (simpler):** Fix the append logic to merge slots:
```typescript
if (append) {
  setSlots(prev => {
    const existingKeys = new Set(prev.map(s => s.start));
    const newSlots = response.data.slots.filter(s => !existingKeys.has(s.start));
    return [...prev, ...newSlots];
  });
} else {
  setSlots(response.data.slots);
}
```

**Option B (cleaner, requires API change):** Pass `offset` / `startDay` to the slots endpoint so it only returns new slots beyond what's already shown. Add query param `fromDaysAhead` to the API:
- `GET /public/calendar/:userId/slots?daysAhead=60&fromDaysAhead=30` → returns only days 30–60.

Start with Option A (no backend change), upgrade to Option B if needed.

**File:** `client/src/components/booking/SlotSelection.tsx`

- Verify the `hasMore` prop is correctly set. Currently `hasMore` is always `true` in `BookingPage.tsx` (line 167: `hasMore` without a value means `true`).
- Change to only show "Load more" when there might be more slots. Define a reasonable max (e.g., 6 months ahead) and set `hasMore={daysAhead < MAX_DAYS_AHEAD}`.
- Define `MAX_DAYS_AHEAD = 180` (6 months).

### Fix 2: Auto-add Google Meet link

**File:** `server/src/calendar/calendar.service.ts`

When creating a Google Calendar event for a booking:
- Add `conferenceData` to the event creation request:
  ```json
  {
    "conferenceData": {
      "createRequest": {
        "requestId": "<unique-id>",
        "conferenceSolutionKey": { "type": "hangoutsMeet" }
      }
    }
  }
  ```
- Set `conferenceDataVersion: 1` in the API call parameters (required for Meet to be created).
- Only add Meet link if the calendar provider is Google (not Office365/Zoho).

**File:** `server/src/calendar/public-calendar.controller.ts`

- The booking creation endpoint should pass a flag `addMeetLink: true` for Google Calendar users.
- Or: always attempt Meet link creation for Google Calendar (safest default).

**File:** `server/src/calendar/calendar.service.ts`

After event creation, extract the Meet link from `conferenceData.entryPoints` in the response and:
1. Include it in the confirmation email sent to the guest.
2. Return it in the booking API response so the frontend can show it in the confirmation page.

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/pages/BookingPage.tsx` | Fix `fetchSlots` append logic; add `MAX_DAYS_AHEAD` guard for `hasMore` |
| `server/src/calendar/calendar.service.ts` | Add `conferenceData` to Google Calendar event creation; extract Meet link |
| `server/src/calendar/public-calendar.controller.ts` | Return Meet link in booking response |
| `client/src/pages/BookingPage.tsx` | Show Meet link in booking confirmation UI |

---

## Testing Approach

### Load more dates:
1. Visit `/book/:userId` — observe initial slots (30 days).
2. Click "Load more dates".
3. Assert: new slots appear below existing ones (not replacing them).
4. Assert: no duplicate slots.
5. Click "Load more dates" again — more slots added.
6. When `daysAhead >= MAX_DAYS_AHEAD`, "Load more dates" button is hidden.

### Google Meet link:
1. Create a test booking via a Google Calendar user.
2. Assert: calendar event has `conferenceData` with a Meet link.
3. Assert: booking confirmation email includes the Meet link.
4. Assert: Meet link appears in the booking confirmation page.

### PostHog check:
- Review PostHog for errors on "Load more dates" click to identify any additional issues mentioned in the issue.

---

## Notes

- The `hasMore` prop being hardcoded as `true` means the "Load more" button always appears, even when there are no more slots to load. The `MAX_DAYS_AHEAD` guard fixes this.
- For Office365 / Zoho users: Meet link is Google-specific. Consider Teams link auto-add for Office365 (out of scope for this issue, but note it).
- The PostHog Correlation ID for load more errors should be investigated before implementing to ensure there are no additional bugs beyond the simple append fix.
