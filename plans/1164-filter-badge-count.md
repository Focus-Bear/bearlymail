# Plan: Fix Filter Badge Count + Priority Filter Stale Closure (#1164 + #1165)

**Issues:** #1164 (badge shows "1 active filter" when all filters are default), #1165 (selecting "High (30-50)" sends minPriority=0)

**Branch:** `openclaw/issue-1164/filter-badge-count-plan`

---

## Root Cause Analysis

### Bug #1164 — Filter badge shows "1 active filter" when all filters show "All"

**Location:** `client/src/pages/Inbox.tsx` (activeFilterCount) + `client/src/hooks/useInboxFilters.ts` (loadInitialFilters) + `client/src/components/inbox/InboxFilters.tsx` (SingleSelectDropdown display)

**Trigger:** Users who visited the app **before PR #1121 was merged** have stale localStorage.

**Timeline of state shape changes:**

1. Before PR #1069: No priority filter at all
2. PR #1069: Added `minPriority: HIGH_PRIORITY_THRESHOLD` (50) as the first-visit default → saved to localStorage
3. PR #1103: Added `maxPriority` field to `InboxFilter` interface → but existing localStorage entries **don't have a `maxPriority` key**
4. PR #1121: Changed first-visit default to `minPriority: null` — but only applies to **new** users; existing localStorage is loaded as-is

**Resulting stale state:** `{ accountIds: [], categories: [], minPriority: 50, maxPriority: undefined }`

**Why badge shows "1":**

```ts
// Inbox.tsx line 93-96
const activeFilterCount =
  (filters.accountIds.length > 0 ? 1 : 0) +
  (filters.categories.length > 0 ? 1 : 0) +
  (filters.minPriority !== null ? 1 : 0); // ← 50 !== null = TRUE → counts as 1
```

**Why dropdown shows "All":**

```ts
// InboxFilters.tsx SingleSelectDropdown
const selectedOption = options.find(
  (opt) => opt.min === selectedMin && opt.max === selectedMax,
);
// Searching for: opt.min === 50 && opt.max === undefined
// "Very High" entry: { min: 50, max: null }
// null !== undefined → NO MATCH
// Falls back to: options[0]?.label = "All"
```

So the user sees "All" in the priority dropdown but the badge counts it as an active filter.
The "Clear all filters" link also appears (driven by `hasActiveFilters` which has the same logic).

**Why `hasActiveFilters` has the same problem:**

```ts
// useInboxFilters.ts line 141
const hasActiveFilters =
  filters.accountIds.length > 0 ||
  filters.categories.length > 0 ||
  filters.minPriority !== null || // ← 50 !== null = TRUE
  filters.maxPriority !== null;
```

**Fix — Sanitize stale localStorage on load:**

In `loadInitialFilters()`, after `JSON.parse(stored)`, validate and migrate the loaded filter:

1. Ensure `maxPriority` is `null` (not `undefined`) — add explicit null coalescing
2. Validate that `(minPriority, maxPriority)` matches a known `PRIORITY_RANGES` entry. If not, reset both to `null`

```ts
function sanitizeStoredFilters(raw: unknown): InboxFilter {
  if (!raw || typeof raw !== "object") {
    return {
      accountIds: [],
      categories: [],
      minPriority: null,
      maxPriority: null,
    };
  }
  const obj = raw as Record<string, unknown>;
  const minPriority =
    typeof obj.minPriority === "number" ? obj.minPriority : null;
  const maxPriority =
    typeof obj.maxPriority === "number" ? obj.maxPriority : null;

  // Validate priority pair against known ranges. Invalid/unrecognised pairs (e.g. from
  // old storage before maxPriority was added) are reset to null/null to avoid ghost active-filter count.
  const priorityIsValid =
    (minPriority === null && maxPriority === null) ||
    PRIORITY_RANGES.some((r) => r.min === minPriority && r.max === maxPriority);

  return {
    accountIds: Array.isArray(obj.accountIds)
      ? (obj.accountIds as string[])
      : [],
    categories: Array.isArray(obj.categories)
      ? (obj.categories as string[])
      : [],
    minPriority: priorityIsValid ? minPriority : null,
    maxPriority: priorityIsValid ? maxPriority : null,
  };
}
```

Replace `return JSON.parse(stored);` in `loadInitialFilters()` with `return sanitizeStoredFilters(JSON.parse(stored));`.

---

### Bug #1165 — Selecting "High (30-50)" sends minPriority=0 (stale closure)

**Location:** `client/src/components/inbox/InboxFilters.tsx` (handlePriorityChange) + `client/src/hooks/useEmailFetching.ts` (fetchEmails stale closure)

**This is the same stale closure bug as #1160 (partially fixed in PR #1161), but on the manual filter bar path.**

**Reproduction sequence:**

1. User selects "Low (0-15)" → minPriority=0 stored, fetchEmails fires correctly (or with prior stale value)
2. User then selects "High (30-50)"
3. `handlePriorityChange(30, 50)` is called in `InboxFilters.tsx`
4. `setPriorityFilter(30, 50)` → React **schedules** state update (async)
5. `onFilterChange?.()` = `fetchEmails()` fires **immediately** (synchronous, same JS tick)
6. `fetchEmails` uses **stale** `buildSummaryParams` (captured in previous render, before state update)
7. Stale `buildSummaryParams` builds params with `minPriority=0` (old "Low" value)
8. API fires: `inbox-summary?...&minPriority=0` ← wrong!

**Code path:**

```
InboxFilters.tsx handlePriorityChange(30, 50):
  setPriorityFilter(30, 50)   // schedules async state update
  onFilterChange?.()           // = fetchEmails() called immediately (stale closure!)
```

**Note on PR #1161:** PR #1161 fixes this same bug for the `onUnlockPriorityTier` path (progressive unlock) by adding an `overrideFilters` param to `fetchEmails`. However, #1161 is currently **NEEDS-REWORK** (failing `Client Tests`). Our fix here addresses the same root cause on the **InboxFilters** path.

**Fix — Pass new filter values directly to fetchEmails from InboxFilters:**

The fix mirrors the `overrideFilters` approach from PR #1161:

**Step 1:** Extend `fetchEmails` signature to accept optional `overrideFilters` (from PR #1161 plan, already in progress):

```ts
// useEmailFetching.ts
const buildSummaryParams = useCallback(
  (overrideFilters?: Partial<InboxFilter>) =>
    buildSummaryParamsImpl(
      mode,
      overrideFilters
        ? ({ ...filters, ...overrideFilters } as InboxFilter)
        : filters,
    ),
  [mode, filters],
);

const fetchEmails = useCallback(
  async (overrideFilters?: Partial<InboxFilter>) => {
    fetchSessionRef.current += 1;
    isLoadingMoreRef.current = false;
    await fetchEmailsImpl({
      mode,
      dispatch,
      buildSummaryParams: (o?: Partial<InboxFilter>) =>
        buildSummaryParamsImpl(
          mode,
          o ? ({ ...filters, ...o } as InboxFilter) : filters,
        ),
      buildAutoRespondedParams,
      buildAutoRespondedSummary,
    });
  },
  [
    mode,
    dispatch,
    filters,
    buildAutoRespondedParams,
    buildAutoRespondedSummary,
  ],
);
```

Actually, the cleaner approach (consistent with #1161's approved direction): add `overrideFilters` as a direct param to `fetchEmailsImpl` rather than rebuilding builders. See implementation note below.

**Step 2:** In `InboxFilters.tsx`, change `onFilterChange` prop type to accept `overrideFilters`:

```ts
// Old:
onFilterChange?: () => void;

// New:
onFilterChange?: (overrideFilters?: Partial<InboxFilter>) => void;
```

**Step 3:** In each handle function, pass the new filter values:

```ts
const handlePriorityChange = (min: number | null, max: number | null) => {
  setPriorityFilter(min, max);
  onFilterChange?.({ minPriority: min, maxPriority: max });
};

const handleAccountChange = (ids: string[]) => {
  setAccountFilter(ids);
  onFilterChange?.({ accountIds: ids });
};

const handleCategoryChange = (ids: string[]) => {
  setCategoryFilter(ids);
  onFilterChange?.({ categories: ids });
};
```

**Step 4:** In `Inbox.tsx`, update the `onFilterChange` prop:

```tsx
<InboxFilters
  onFilterChange={(overrideFilters) => fetchEmails(overrideFilters)}
  ...
/>
```

**Step 5:** In `useEmailFetching.ts`, extend `fetchEmails` to accept `overrideFilters?: Partial<InboxFilter>` and pass it through to `buildSummaryParamsImpl`:

```ts
const fetchEmails = useCallback(
  async (overrideFilters?: Partial<InboxFilter>) => {
    fetchSessionRef.current += 1;
    isLoadingMoreRef.current = false;
    const effectiveFilters = overrideFilters
      ? ({ ...filters, ...overrideFilters } as InboxFilter)
      : filters;
    await fetchEmailsImpl({
      mode,
      dispatch,
      buildSummaryParams: () => buildSummaryParamsImpl(mode, effectiveFilters),
      buildAutoRespondedParams: () =>
        buildAutoRespondedParamsImpl(effectiveFilters),
      buildAutoRespondedSummary,
    });
  },
  [mode, dispatch, filters, buildAutoRespondedSummary],
);
```

This way, `fetchEmails(overrideFilters)` bypasses the stale closure entirely by computing `effectiveFilters` from the function's argument rather than the stale closure's `filters`.

Also update `useEmailManagement.ts` to thread the `overrideFilters` param through `fetchEmails`.

---

## Relationship to PR #1161

| Path                                              | Bug                               | #1161                 | This PR      |
| ------------------------------------------------- | --------------------------------- | --------------------- | ------------ |
| Progressive unlock (`onUnlockPriorityTier`)       | Stale closure → wrong minPriority | Fixes ✅ (but CI red) | Out of scope |
| Manual filter bar (`InboxFilters.onFilterChange`) | Stale closure → wrong minPriority | **Not covered** ❌    | Fixes ✅     |
| localStorage migration                            | Ghost active-filter count         | Not covered ❌        | Fixes ✅     |

**Coordination:** This PR (for #1164 + #1165) should be designed to be merge-compatible with #1161. Both PRs touch `useEmailFetching.ts`. If #1161 merges first, the `overrideFilters` param will already exist; Codebeard should rebase and only add the `InboxFilters` path changes. If this PR merges first, #1161 should rebase on it.

---

## Files to Change

| File                                           | Change                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `client/src/hooks/useInboxFilters.ts`          | Add `sanitizeStoredFilters()` helper; call it in `loadInitialFilters()` instead of returning raw `JSON.parse`            |
| `client/src/hooks/useEmailFetching.ts`         | Add `overrideFilters?: Partial<InboxFilter>` param to `fetchEmails`; merge with stale filters inside callback            |
| `client/src/hooks/useEmailManagement.ts`       | Thread `overrideFilters` through `fetchEmails` signature                                                                 |
| `client/src/components/inbox/InboxFilters.tsx` | Change `onFilterChange` prop type to `(overrideFilters?: Partial<InboxFilter>) => void`; pass new values in each handler |
| `client/src/pages/Inbox.tsx`                   | Update `onFilterChange` call: `(overrideFilters) => fetchEmails(overrideFilters)`                                        |

---

## Test Cases

### #1164 — Badge count

1. **Old localStorage migration:** Simulate `localStorage` with `{ minPriority: 50 }` (no `maxPriority` key) → `loadInitialFilters()` returns `{ minPriority: null, maxPriority: null }` → `hasActiveFilters = false`, badge = 0
2. **Valid stored range:** Simulate `{ minPriority: 30, maxPriority: 50 }` → returns as-is → `hasActiveFilters = true`, badge = 1
3. **Valid null/null:** `{ minPriority: null, maxPriority: null }` → returns as-is → `hasActiveFilters = false`, badge = 0
4. **Invalid range (no match):** `{ minPriority: 25, maxPriority: 99 }` → sanitized to `null/null` → `hasActiveFilters = false`
5. **`hasActiveFilters` false when all null:** After clear, `hasActiveFilters = false`, "Clear all filters" link hidden

### #1165 — Priority filter stale closure

6. **fetchEmails with overrideFilters:** Mock `buildSummaryParamsImpl`; call `fetchEmails({ minPriority: 30, maxPriority: 50 })` while `filters.minPriority = 0` → verify API called with `minPriority=30&maxPriority=50` (not 0)
7. **InboxFilters handlePriorityChange:** Render `InboxFilters`, select "High (30-50)" → verify `onFilterChange` called with `{ minPriority: 30, maxPriority: 50 }`
8. **InboxFilters handleAccountChange:** Verify `onFilterChange` called with `{ accountIds: [...] }`
9. **InboxFilters handleCategoryChange:** Verify `onFilterChange` called with `{ categories: [...] }`
10. **Regression — fetchEmails without overrideFilters:** Call `fetchEmails()` (no arg) → uses current filters (no change in baseline behavior)

---

## Notes

- `sanitizeStoredFilters` validates the `(minPriority, maxPriority)` pair against `PRIORITY_RANGES`. This handles the migration case cleanly without special-casing `HIGH_PRIORITY_THRESHOLD = 50`.
- The `maxPriority: undefined` (missing key) is the key symptom. `JSON.parse('{"minPriority":50}').maxPriority === undefined` → `undefined !== null` in the `options.find` → display falls back to "All".
- For `appendFilterParams` in `useEmailFetching.ts`: the existing guard `filters.minPriority !== null && filters.minPriority !== undefined` already handles the case where minPriority=0 is a valid filter value (e.g., "Low" range starting at 0). No change needed to `appendFilterParams`.
- `LOW_PRIORITY_THRESHOLD` and `MEDIUM_PRIORITY_THRESHOLD` are introduced in PR #1161 (NEEDS-REWORK). This plan does NOT depend on them. The `sanitizeStoredFilters` validates against `PRIORITY_RANGES` directly.

---

_Plan authored by monk-of-modularity (OpenClaw agent)_
