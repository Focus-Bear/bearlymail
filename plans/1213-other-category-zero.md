# Plan: #1213 — "Other" category shows 0 emails after #1185

**Status:** In investigation  
**Priority:** P1  
**Branch:** `plan/1213-other-category-zero`  
**Filed by:** Monk of Modularity (agent)

---

## Summary

The "Other" category accordion consistently shows 0 emails after `GET /inbox?mode=triage&categoryIds=Other` correctly returns 1 email. Both #1185 and #1192 are confirmed merged and deployed (build `8b9532a`). The fetch fires, but no subsequent `markCategoryLoaded` dispatch is logged, and the accordion remains at count=0.

Console evidence:
```
[Accordion] Effect1 queuing fetch for keys: ['Other'] | expanded: ['Other'] | loaded: [] | loading: []
```
No follow-up log. No fetch completion. Count stays 0.

---

## Root Cause Trace: fetch → Redux → render

### Step 1 — Summary API (`GET /inbox-summary`)

`getInboxSummary()` on the server maps threads with no `category` or `categoryId` to the string `"Other"`. `lookupCategoryId("Other")` returns `null` (no UserContext entry exists for the synthetic "Other" category — it is not a real DB-backed category). Therefore the summary for "Other" arrives as:

```json
{ "id": null, "name": "Other", "count": 1 }
```

### Step 2 — Client key derivation

`getCategoryKey(id, name)`:
```ts
export function getCategoryKey(id: string | null | undefined, name: string): string {
  return id ?? name;
}
```

When `id === null`, this returns `name = "Other"`. ✅ The key for "Other" is the string `"Other"` throughout the client.

### Step 3 — Effect 1 fires correctly

`useInboxCategoryAccordion` → `useCategoryFetchEffects` → Effect 1 correctly derives key `"Other"` from the summary item and calls:
```ts
fetchCategoryEmails("Other", undefined /* id is null/undefined */)
```

The console log confirms this fires.

### Step 4 — `fetchCategoryEmailsImpl` computes catKey

```ts
const catKey = getCategoryKey(categoryId, categoryName);
// categoryId = undefined → catKey = "Other"
```

Still `"Other"`. ✅

### Step 5 — Cache check

`getCachedCategoryEmails(mode, "Other")` uses `categoryKey()`:
```ts
const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
return `bearlymail_v2_cat_${mode}_${safe}`;
// → "bearlymail_v2_cat_triage_Other"
```

"Other" passes the regex unchanged. Cache key is valid. If a **stale cache entry** exists with 0 emails (from before the backend had emails), the stale-while-revalidate path fires:
```ts
serveCategoryFromCacheAndRefresh({ cachedEmails: [], catKey: "Other", ... });
// → dispatch(updateCategoryEmails({ categoryKey: "Other", emails: [] }));
// → dispatch(markCategoryLoaded("Other"));  ← marks as loaded with 0 emails
// → background refresh fires but result is ignored if sessionId changed
```

**This is the primary bug path.**

### Step 6 — The `#1185` defense-in-depth check is bypassed on the stale-cache path

The `#1185` fix added this defense after the fresh API fetch:
```ts
if (emails.length === 0) {
  const summaryCount = summaryItem?.count ?? 0;
  if (summaryCount > 0) {
    dispatch(markCategoryLoadFailed(catKey));  // prevent stuck-at-0
  } else {
    dispatch(markCategoryLoaded(catKey));
  }
}
```

**However, this code is in `fetchCategoryEmailsImpl`'s happy path (after the API call). When the stale cache path fires via `serveCategoryFromCacheAndRefresh`, execution returns early before reaching this defense.** The stale-cache path unconditionally calls `markCategoryLoaded(catKey)` and dispatches `updateCategoryEmails` with 0 emails.

The `#1185` fix only protects the **fresh fetch** path. It has no coverage over `serveCategoryFromCacheAndRefresh`.

### Step 7 — Background refresh in `serveCategoryFromCacheAndRefresh` is silently abandoned

```ts
const sessionId = fetchSessionRef.current;
axios.get(`${API_URL}/emails/inbox?${params.toString()}`)
  .then(response => {
    if (fetchSessionRef.current !== sessionId) {
      return;  // ← silently aborted if session changed
    }
    const freshEmails: Email[] = response.data.emails;
    dispatch(updateCategoryEmails({ categoryKey: catKey, emails: freshEmails }));
    setCachedCategoryEmails(mode, catKey, freshEmails);
  })
```

If `fetchEmails()` (the summary refetch) fires while the background refresh is in flight — e.g. because Effect 1 re-triggers after the summary resolves — `fetchSessionRef.current` is incremented and the background refresh result is silently discarded. The store keeps `emails: []` for "Other" and `loadedCategoryNames: ["Other"]`.

### Step 8 — Accordion renders count=0

In `InboxCategoryItem`:
```tsx
count={isLoaded ? categoryEmails.length : categoryItem.count}
```

Once `isLoaded = true` (from `markCategoryLoaded`), the count switches from the summary's `1` to `categoryEmails.length` which is `0`. The badge shows 0. The stale `emails: []` that was dispatched in step 5 stays in the store.

### Step 9 — Why Effect 2 (limbo recovery) does NOT rescue this

Effect 2 only fires for categories that are **not in loaded and not in loading**. But after step 5, `"Other"` IS in `loadedCategoryNames`. Effect 2 sees it as "loaded" and skips it. There is no retry path.

---

## Confirmed Root Cause

**`serveCategoryFromCacheAndRefresh` unconditionally marks a category as loaded (even with 0 cached emails) and relies on the background refresh to fill in the real emails. But the background refresh is silently dropped when `fetchSessionRef.current` changes — which happens whenever `fetchEmails()` is called again (e.g. by mode change, filter change, or re-mount). The #1185 defense-in-depth check exists only in the fresh-fetch path and cannot fire here.**

This means: on second (and subsequent) visits to the "Other" accordion within the same session, if the cache has a stale 0-email entry, the accordion permanently renders 0 and is unrecoverable until the user hard-refreshes.

---

## Secondary Contributing Factor

Even on the first visit (no stale cache), there is a subtle race between:

1. Effect 1 firing `fetchCategoryEmails("Other", undefined)` (no categoryId passed)
2. `getCategoryKey(undefined, "Other")` → key `"Other"`
3. The fresh fetch lands, calls `markCategoryLoaded("Other")`
4. `updateCategoryEmails` is dispatched with the API emails

In `updateCategoryEmails` in the reducer:
```ts
const isOther = categoryKey === CATEGORY_OTHER;
// → isOther = true

// Remove old "Other" emails
state.emails = state.emails.filter(event => {
  if (isOther) {
    return (
      event.category !== null &&
      event.category !== undefined &&
      event.category !== '' &&
      event.category !== CATEGORY_OTHER
    );
  }
  return !matchesCategory(event);
});
state.emails = [...state.emails, ...stampedEmails];
```

The `isOther` branch correctly removes old "Other" emails and adds the new ones. This path is fine for the **fresh fetch**. The reducer logic is correct.

The bug is upstream — in `serveCategoryFromCacheAndRefresh`.

---

## Fix

### Option A — Recommended: Skip cache if cached data is empty but summary count > 0

In `fetchCategoryEmailsImpl`, before calling `serveCategoryFromCacheAndRefresh`, add a check:

```ts
const cachedEmails = getCachedCategoryEmails(mode, catKey);
if (cachedEmails !== null) {
  // Defense-in-depth: if the cache has 0 emails but the summary says > 0,
  // treat this as a stale/invalid cache entry and do a fresh fetch.
  // An empty cache for a non-empty category means the last fetch was abandoned
  // (e.g. session changed mid-flight), and serving it would permanently render 0.
  if (cachedEmails.length === 0) {
    const summaryItem = categorySummaryRef.current?.find(
      item => item.id === categoryId || item.name === categoryName
    );
    const summaryCount = summaryItem?.count ?? 0;
    if (summaryCount > 0) {
      console.warn(
        '[Accordion] Cache has 0 emails but summary says', summaryCount,
        '— treating as stale cache miss for category:', categoryName, '(key:', catKey, ')'
      );
      // Fall through to fresh fetch below
    } else {
      serveCategoryFromCacheAndRefresh({ cachedEmails, catKey, categoryName, mode, dispatch, buildCategoryParams, fetchSessionRef });
      return;
    }
  } else {
    serveCategoryFromCacheAndRefresh({ cachedEmails, catKey, categoryName, mode, dispatch, buildCategoryParams, fetchSessionRef });
    return;
  }
}
```

This is a targeted fix: only the case where cache says empty but summary says non-empty is changed. All other cache paths are unchanged.

### Option B — Also fix `serveCategoryFromCacheAndRefresh` to apply `#1185` defense

Add the `#1185` defense to the **background refresh path** inside `serveCategoryFromCacheAndRefresh`:

```ts
.then(response => {
  if (fetchSessionRef.current !== sessionId) {
    return;
  }
  const freshEmails: Email[] = response.data.emails;
  dispatch(updateCategoryEmails({ categoryKey: catKey, emails: freshEmails }));
  setCachedCategoryEmails(mode, catKey, freshEmails);
  // Re-apply markCategoryLoaded in case the initial dispatch used stale 0-email data
  dispatch(markCategoryLoaded(catKey));
})
```

Additionally, if the fresh background refresh returns 0 but summary shows > 0, call `markCategoryLoadFailed` to trigger Effect 2 limbo recovery:

```ts
.then(response => {
  if (fetchSessionRef.current !== sessionId) {
    return;
  }
  const freshEmails: Email[] = response.data.emails;
  dispatch(updateCategoryEmails({ categoryKey: catKey, emails: freshEmails }));
  setCachedCategoryEmails(mode, catKey, freshEmails);
  if (freshEmails.length === 0) {
    // Check summary — if it says > 0, the cache data is genuinely stale and loaded
    // state should be revoked so Effect 2 can recover it.
    // (Requires categorySummaryRef to be threaded into serveCategoryFromCacheAndRefresh)
  }
})
```

This is more invasive and requires passing `categorySummaryRef` into `serveCategoryFromCacheAndRefresh`.

### Recommendation

**Implement Option A as the minimal targeted fix. Option B as defence-in-depth if needed.**

Option A has the smallest blast radius: it only changes the case that is definitively broken (empty cache + non-empty summary) and falls through to the normal fresh-fetch path that already has all the right guards.

---

## Files to Change

| File | Change |
|------|--------|
| `client/src/hooks/useEmailFetching.ts` | In `fetchCategoryEmailsImpl`: add "empty cache + non-empty summary → skip to fresh fetch" guard before calling `serveCategoryFromCacheAndRefresh`. |
| `client/src/hooks/useEmailFetching.test.ts` | Add test: when `getCachedCategoryEmails` returns `[]` and summary count is `> 0`, it should NOT call `serveCategoryFromCacheAndRefresh`, and should proceed to the fresh API call path. |

---

## Recommended Debug Logging (for Jeremy to verify in prod)

Add to `fetchCategoryEmailsImpl` immediately after the cache hit check:

```ts
console.log(
  '[Accordion] Cache hit for category:', categoryName,
  '(key:', catKey, ')',
  '| cachedEmails.length:', cachedEmails.length,
  '| summaryCount:', categorySummaryRef.current?.find(i => i.id === categoryId || i.name === categoryName)?.count ?? 'unknown'
);
```

And to `serveCategoryFromCacheAndRefresh` at the start of the background refresh `.then()`:

```ts
console.log(
  '[Accordion] Background refresh resolved for category:', categoryName,
  '| sessionId match:', fetchSessionRef.current === sessionId,
  '| freshEmails.length:', freshEmails.length
);
```

These two logs together will confirm whether:
1. The stale cache path fires with 0 emails
2. Whether the background refresh result is being silently dropped

---

## Why #1185 and #1192 Didn't Fix This

- **#1185** added `markCategoryLoadFailed` when the **fresh API returns 0 but summary says > 0**. The stale-cache path never reaches this code.
- **#1192** deleted Effect 2's "navigate loop" (the redundant `expandedCategories` dep). But Effect 2 only fires when a category is in limbo — not loaded AND not loading. Once the stale-cache path marks "Other" as **loaded**, Effect 2 correctly ignores it. Effect 2 is not the rescue mechanism here.

The bug predates both fixes and lives in the interaction between `serveCategoryFromCacheAndRefresh` and the session-invalidation guard on the background refresh.

---

## Testing Plan

1. **Unit test** in `useEmailFetching.test.ts`:
   - Mock `getCachedCategoryEmails` to return `[]`
   - Set `categorySummaryRef.current` to `[{ id: null, name: "Other", count: 1 }]`
   - Assert that `serveCategoryFromCacheAndRefresh` is NOT called
   - Assert that the fresh API fetch IS called
   - Assert that `markCategoryLoaded("Other")` is dispatched after fresh fetch returns 1 email

2. **Manual repro steps**:
   - Open inbox with "Other" accordion
   - Expand "Other" → verify 1 email loads
   - Archive all "Other" emails (cache now stores `[]`)
   - Receive a new "Other" email (summary count returns to 1)
   - Reload page (localStorage cache still has `[]` for "Other")
   - Expand "Other" → BUG: shows 0 emails
   - With fix: "Other" triggers fresh fetch, shows 1 email

---

_Filed by Monk of Modularity · P1 · Focus-Bear/BearlyMail#1213_
