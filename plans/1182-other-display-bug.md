# Plan: Fix 'Other' Category Shows 0 Emails in UI (Issue #1182)

## Status: Plan — Ready for Codebeard

## Summary

The 'Other' category accordion fetches emails correctly (API returns 2 emails when called
with `?mode=triage&categoryIds=Other`) but the UI shows 0. The debug panel's Category
Summary section shows the summary count as 2 (correct) but the accordion renders empty.

## Evidence

- Network: `inbox?mode=triage&categoryIds=Other` → 2 emails, `categoryId: null`, `category: 'Other'`
- Debug panel: Category Summary count = 2 (correct)
- Console: `loaded: []` — `loadedCategoryNames` is empty after the fetch completes
- Accordion: shows 0 emails

## Root Cause Analysis

### Primary cause: fetchSession race condition (caused by the #1183 navigate loop)

The navigate/replaceState loop described in issue #1183 causes `fetchEmails()` to be called
repeatedly as a side effect of mode-change re-triggers. Every call to `fetchEmails()`:

1. Increments `fetchSessionRef.current` (see `useEmailFetching.ts`, `fetchEmails` callback)
2. Calls `dispatch(clearCategoryState())` (via `dispatchFetchStart`)

When a category fetch is in flight (e.g., fetching 'Other' with sessionId=N) and
`fetchEmails()` fires again due to the loop:

1. `fetchSessionRef.current` becomes N+1
2. When the 'Other' fetch resolves: `fetchSessionRef.current !== sessionId` → **abandoned**
3. `dispatch(markCategoryLoaded('Other'))` never fires
4. `loadedCategoryNames` stays `[]`

The console `loaded: []` log is the Effect 1 pre-fetch log showing `loadedCategoryNamesRef.current`
at the time the fetch is queued. The fetch is then silently abandoned, so the state never updates.

**Fixing #1183 (navigate loop) should resolve this race condition.**

### Key insight: this is not a key-mismatch bug

Analysis of the full data pipeline shows keys are consistent:

| Step                                             | Key used         | Value                         |
| ------------------------------------------------ | ---------------- | ----------------------------- |
| `getCategoryKey(null, 'Other')`                  | accordion lookup | `'Other'`                     |
| `buildCategoryParamsImpl('Other')`               | API param        | `categoryIds=Other`           |
| `fetchCategoryEmailsImpl` catKey                 | store key        | `'Other'`                     |
| `markCategoryLoaded('Other')`                    | loaded tracking  | `'Other'`                     |
| `updateCategoryEmails({ categoryKey: 'Other' })` | stamp            | `category_id = 'Other'`       |
| `groupEmailsByCategory`                          | email group key  | `email.category_id = 'Other'` |
| `emailCategoryMap.get('Other')`                  | display lookup   | `'Other'` ✓                   |

No key mismatch. The data path is correct. The race condition is the culprit.

### Secondary cause: markCategoryLoaded fires with 0 emails (defense-in-depth fix needed)

Even after the race condition is resolved, if the server returns 0 emails for 'Other' while
the summary says count > 0 (due to a different race or cache issue), the current code calls
`dispatch(markCategoryLoaded(catKey))` unconditionally. This results in:

- `isLoaded = true`
- `categoryEmails.length = 0`
- Accordion shows 0 (not loading spinner, not summary count — just 0)

This is the scenario that produces the `loaded: []` → `isLoaded=true, categoryEmails=[]` state.

## Fix Strategy

### Step 1: Fix #1183 first (navigate loop → prerequisite)

**File:** `client/src/hooks/useInboxUrlSync.ts`

Remove `navigate` from Effect 2's dep array using the useRef callback pattern (same as
#1177 applied to Effect 3):

```ts
// Add near top of hook body:
const navigateRef = useRef<ReturnType<typeof useNavigate>>(navigate);
navigateRef.current = navigate;

// Effect 2 — remove navigate from deps:
useEffect(() => {
  if (isInitialMount.current) return;
  const newPath = splitViewSelectedEmailId
    ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
    : `${basePath}/${mode}`;
  if (newPath !== lastUrlRef.current) {
    lastUrlRef.current = newPath;
    navigateRef.current(newPath, { replace: true }); // read from ref
  }
}, [mode, splitViewSelectedEmailId, basePath]); // navigate REMOVED
```

Also fix double-navigate on mount: in Effect 1, update `lastUrlRef.current` before navigating:

```ts
if (!urlMode) {
  const initialPath = `${basePath}/${mode}`;
  lastUrlRef.current = initialPath; // prevent Effect 2 from double-navigating
  navigate(initialPath, { replace: true });
}
```

### Step 2: Verify Other resolves after #1183 fix

Test after deploy:

- Open inbox with Other emails
- Confirm accordion shows correct count
- Confirm `loaded: []` no longer appears (or is followed by successful load)

### Step 3: Defense-in-depth fix in useEmailFetching.ts

**File:** `client/src/hooks/useEmailFetching.ts`

In `fetchCategoryEmailsImpl`, after receiving 0 emails when summary says count > 0,
do NOT call `markCategoryLoaded`. Let limbo recovery retry:

```ts
// After the existing 0-email / stale-UUID check block:
const summaryItem = categorySummaryRef.current?.find(
  (item) => item.id === categoryId || item.name === categoryName,
);
const summaryCount = summaryItem?.count ?? 0;

categoryBackoff.onSuccess(catKey);
dispatch(updateCategoryEmails({ categoryKey: catKey, emails }));
setCachedCategoryEmails(mode, catKey, emails);

if (emails.length === 0 && summaryCount > 0) {
  // Don't mark as loaded — accordion would show 0 with no retry possible.
  // markCategoryLoadFailed keeps it in retry state; limbo recovery (Effect 2)
  // will trigger a fresh fetch.
  dispatch(markCategoryLoadFailed(catKey));
  console.warn(
    "[Accordion] Category returned 0 emails but summary says",
    summaryCount,
    "— marking failed for retry:",
    categoryName,
    "(key:",
    catKey,
    ")",
  );
} else {
  dispatch(markCategoryLoaded(catKey));
  console.log(
    "[Accordion] Loaded category:",
    categoryName,
    "(key:",
    catKey,
    ")",
    emails.length,
    "emails",
  );
}
```

## Files to Change

| File                                   | Change                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `client/src/hooks/useInboxUrlSync.ts`  | Wrap navigate in ref, remove from Effect 2 deps, fix double-navigate on mount |
| `client/src/hooks/useEmailFetching.ts` | Don't markCategoryLoaded if 0 emails but summary > 0                          |

## Testing

1. Open inbox with emails in 'Other' category
2. Expand 'Other' accordion → confirm emails are visible
3. Rapidly switch modes during 'Other' load → confirm retry kicks in, not stuck at 0
4. Check Chrome DevTools: no `Throttling navigation` warning
5. `npm test -- --watchAll=false` → all tests pass

## Acceptance Criteria

- [ ] 'Other' category accordion shows correct email count after expand
- [ ] `loaded: []` in console is eventually followed by `markCategoryLoaded('Other')`
- [ ] If API returns 0 emails when summary says > 0, category stays in retry state (not shown as 0)
- [ ] No `Throttling navigation` in console (from #1183 fix)
- [ ] All tests pass

## Dependencies

- **Blocks on #1183 (navigate loop fix)** — primary race condition cause
- Server fix from #1175 already deployed (server correctly returns emails for `categoryIds=Other`)

## Priority

P1 — 'Other' is the catch-all for uncategorised emails. All users with uncategorised threads
see an empty accordion.

---

_Monk of Modularity (AI agent)_
