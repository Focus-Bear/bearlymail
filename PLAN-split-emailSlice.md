# Plan: Split `emailSlice` (30 Actions) into Focused Slices

**Issue:** #1225 (Critical Issue #9 — Redux emailSlice)
**Planned by:** Monk of Modularity 🧘
**Phase:** 1.2 (Foundation)

## Problem

`emailSlice` has 30 exported actions managing 6 different concerns in a single slice:

- Email data (set, append, update, remove, restore)
- Optimistic updates (archive, snooze — add/remove)
- Animations (animatingOut — add/remove)
- Loading states (4 boolean flags: loading, decrypting, refreshing, loadingModeSwitch)
- Category management (summary, loaded/loading/exhausted names)
- Cache timestamps (lastFetchedAt, invalidateInboxCache)

The `EmailState` interface has 19 fields. The `updateCategoryEmails` reducer alone is 60 lines.

## Current Actions (30 total)

### Email Data (6)

- `setEmails`, `appendEmails`, `updateCategoryEmails`
- `removeEmail`, `updateEmail`, `restoreEmail`

### Optimistic Updates (4)

- `addOptimisticArchive`, `removeOptimisticArchive`
- `addOptimisticSnooze`, `removeOptimisticSnooze`

### Animations (2)

- `addAnimatingOut`, `removeAnimatingOut`

### Loading States (6)

- `setLoading`, `setDecrypting`, `setRefreshing`, `setLoadingModeSwitch`
- `setFetchError`, `setSummaryLoading`

### Category Management (7)

- `setCategorySummary`, `decrementCategorySummaryCount`, `incrementCategorySummaryCount`
- `markCategoryLoaded`, `markCategoryLoading`, `markCategoryLoadFailed`, `markCategoryFetchExhausted`
- `resetCategoryExhausted`, `clearCategoryState`

### Pagination + Cache (5)

- `setHasMore`, `setTotalCount`, `setCurrentOffset`
- `setLastFetchedAt`, `invalidateInboxCache`

## Proposed Split

### If React Query is adopted first (recommended — per Plan PR #1236):

Most of this slice disappears. After TanStack Query owns server state:

**Keep in Redux (as `inboxUISlice`):**

```typescript
interface InboxUIState {
  optimisticallyArchived: string[];
  optimisticallySnoozed: string[];
  animatingOut: AnimatingOutItem[];
  loadingModeSwitch: boolean; // UI transition flag
}
// 8 actions: add/remove optimistic archive/snooze, add/remove animatingOut,
//            setLoadingModeSwitch, clearOptimisticState
```

**Delete from Redux (moved to React Query):**

- `emails`, `categorySummary`, `loading`, `decrypting`, `refreshing`, `fetchError`
- `hasMore`, `totalCount`, `currentOffset`
- `loadedCategoryNames`, `loadingCategoryNames`, `exhaustedCategoryNames`
- `lastFetchedAt`, `summaryLoading`
- All 22 associated actions

**Result: 30 actions → 8 actions. 19 state fields → 4 fields.**

### If done standalone (without React Query):

Split into 3 focused slices:

#### `inboxDataSlice` — Core email data

```typescript
interface InboxDataState {
  emails: Email[];
  hasMore: boolean;
  totalCount: number;
  currentOffset: number;
  categorySummary: CategorySummaryItem[] | null;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames: string[];
  lastFetchedAt: number | null;
}
// 17 actions: setEmails, appendEmails, updateCategoryEmails, removeEmail,
//             updateEmail, restoreEmail, setHasMore, setTotalCount, setCurrentOffset,
//             setCategorySummary, markCategoryLoaded, markCategoryLoading,
//             markCategoryLoadFailed, markCategoryFetchExhausted, resetCategoryExhausted,
//             clearCategoryState, setLastFetchedAt, invalidateInboxCache
```

#### `inboxUISlice` — UI state (optimistic + animations + loading)

```typescript
interface InboxUIState {
  optimisticallyArchived: string[];
  optimisticallySnoozed: string[];
  animatingOut: AnimatingOutItem[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  summaryLoading: boolean;
  fetchError: string | null;
}
// 11 actions: add/removeOptimisticArchive, add/removeOptimisticSnooze,
//             add/removeAnimatingOut, setLoading, setDecrypting, setRefreshing,
//             setLoadingModeSwitch, setSummaryLoading, setFetchError
```

#### Consolidate loading flags

Replace 4 booleans + 1 error with a state machine:

```typescript
type InboxFetchStatus =
  | "idle"
  | "loading"
  | "decrypting"
  | "refreshing"
  | "switching-mode"
  | "error";

interface InboxUIState {
  fetchStatus: InboxFetchStatus;
  fetchError: string | null;
  // ... rest
}
```

### Selector Updates

Current `selectVisibleEmails` crosses optimistic + data concerns:

```typescript
// Before: reads from single emailSlice
const selectVisibleEmails = createSelector(
  [selectEmails, selectOptimisticallyArchived, selectOptimisticallySnoozed, selectAnimatingOut],
  (emails, archived, snoozed, animating) => ...
);

// After: reads from both slices (still works with createSelector)
const selectVisibleEmails = createSelector(
  [selectInboxEmails, selectOptimisticArchives, selectOptimisticSnoozes, selectAnimatingOutItems],
  (emails, archived, snoozed, animating) => ...
);
```

## Migration Strategy

1. Create new slice files alongside existing `emailSlice.ts`
2. Move state + reducers to new slices
3. Update `combineReducers` in store config
4. Update all imports (search for `from 'store/slices/emailSlice'`)
5. Update selectors to point at new slice state paths
6. Delete old `emailSlice.ts`

**Import count to update:**

```
grep -rn "from.*emailSlice" client/src/ --include="*.ts" --include="*.tsx" | wc -l
→ ~25 files
```

## Recommendation

**Do this AFTER React Query adoption (Plan PR #1236).** With React Query owning server state, this becomes trivial — just extract the 4 UI fields and 8 actions into `inboxUISlice` and delete everything else. Without React Query, the split is more complex and less impactful.

## Estimated Effort

- With React Query first: **S** (< 1 day)
- Standalone: **M** (2-3 days)

## Dependencies

- Recommended after: #1236 (TanStack Query adoption)
- Independent of: #1235 (InboxContext)
