# Plan: Booking Page — Fetch 5 Slots on Load, Lazy-Load More

## Problem

The `/book/:id` booking page fetches **50 time slots** across a **90-day window** on initial page load. This is excessive — most users pick one of the first few available times.

The backend already supports pagination (`offset`/`limit` query params) and even has a sensible default (`DEFAULT_SLOTS_LIMIT = 8`), but the frontend overrides it by explicitly passing `limit=50` and `daysAhead=90`.

## Root Cause

| What                  | Where                                                  | Current Value                     |
| --------------------- | ------------------------------------------------------ | --------------------------------- |
| Frontend page size    | `client/src/pages/BookingPage.tsx:32`                  | `SLOTS_PER_PAGE = 50`             |
| Frontend days window  | `client/src/pages/BookingPage.tsx:33`                  | `DAYS_AHEAD_FIXED = 90`           |
| API call              | `client/src/pages/BookingPage.tsx:63`                  | `?daysAhead=90&offset=0&limit=50` |
| Backend default limit | `server/src/calendar/public-calendar.controller.ts:17` | `DEFAULT_SLOTS_LIMIT = 8`         |
| Backend max limit     | `server/src/calendar/public-calendar.controller.ts:18` | `MAX_SLOTS_LIMIT = 50`            |
| Service method        | `server/src/calendar/calendar.service.ts:178`          | `getAvailableSlotsWithTimezone()` |

## Architecture (Existing)

The infrastructure for pagination **already exists**:

- **Backend**: `public-calendar.controller.ts` accepts `offset`, `limit`, and `afterDate` query params. `calendar.service.ts:190` fetches `limit + 1` to detect `hasMore` and returns `{ slots, timezone, hasMore }`.
- **Frontend**: `BookingPage.tsx` already has `slotOffset`, `hasMore`, `loadingMore` state, a `handleLoadMore()` function (line 93), and passes `onLoadMore`/`loadingMore`/`hasMore` props to `SlotSelection`.
- **SlotSelection.tsx** already renders a "Load more dates" button when `hasMore` is true.

**The only problem is the initial fetch size.** The client asks for 50 when it should ask for 5.

## Changes Required

### File 1: `client/src/pages/BookingPage.tsx`

**Change 1** — Line 32: Reduce initial page size

```diff
-const SLOTS_PER_PAGE = 50;
+const INITIAL_SLOTS = 5;
+const LOAD_MORE_SLOTS = 15;
```

**Change 2** — Line 33: Reduce days-ahead window for initial load

```diff
-const DAYS_AHEAD_FIXED = 90;
+const DAYS_AHEAD_INITIAL = 14;
+const DAYS_AHEAD_LOAD_MORE = 90;
```

**Change 3** — Line 63: Update the `fetchSlots` function to use different limits for initial vs load-more

```diff
 const fetchSlots = useCallback(async (currentOffset: number, append = false) => {
+    const currentLimit = append ? LOAD_MORE_SLOTS : INITIAL_SLOTS;
+    const currentDaysAhead = append ? DAYS_AHEAD_LOAD_MORE : DAYS_AHEAD_INITIAL;
     try {
       ...
       const response = await axios.get(
-        `${API_URL}/public/calendar/${userId}/slots?daysAhead=${DAYS_AHEAD_FIXED}&offset=${currentOffset}&limit=${SLOTS_PER_PAGE}`,
+        `${API_URL}/public/calendar/${userId}/slots?daysAhead=${currentDaysAhead}&offset=${currentOffset}&limit=${currentLimit}`,
       );
```

**Change 4** — Line 94: Update `handleLoadMore` to use `LOAD_MORE_SLOTS` for offset increment

```diff
 const handleLoadMore = () => {
-    const newOffset = slotOffset + SLOTS_PER_PAGE;
+    const newOffset = slotOffset + LOAD_MORE_SLOTS;
     setSlotOffset(newOffset);
     fetchSlots(newOffset, true);
   };
```

### No backend changes needed

The backend already:

- Accepts `limit` as a query param (line 36)
- Caps it at `MAX_SLOTS_LIMIT = 50` (line 39)
- Defaults to 8 when not provided (line 40)
- Returns `hasMore` flag correctly (line 192-193)
- Supports `afterDate` for cursor-based pagination (line 44)

## Behavior After Fix

| Action                       | Slots Fetched | Days Window |
| ---------------------------- | ------------- | ----------- |
| Initial page load            | 5             | 14 days     |
| Each "Show more times" click | 15            | 90 days     |

- Initial load is ~10x faster (5 slots in 14-day window vs 50 in 90 days)
- "Show more times" button (already rendered by `SlotSelection.tsx:130-133`) loads batches of 15
- No full page reload — existing `append` logic merges + deduplicates slots (line 68-73)

## Testing

1. Load `/book/:userId` — should show ~5 time slots quickly
2. Click "Show more times" — should append more slots without page reload
3. Verify `hasMore` turns false when no more slots available
4. Check mobile — should feel noticeably faster on initial load

## Risk Assessment

- **Low risk**: Only changing two constants and splitting them into initial/load-more variants
- **No API contract changes**: Backend is unchanged
- **Backward compatible**: The existing pagination infrastructure handles everything
- **Edge case**: If user has < 5 available slots in 14 days, they see all slots + no "load more" (correct behavior, `hasMore` will be false)

---

_Authored by: Monk of Modularity 🧘 (AI agent)_
