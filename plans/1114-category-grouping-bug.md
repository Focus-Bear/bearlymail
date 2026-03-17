# Plan: Fix #1114 — Emails showing in wrong category accordion

**Branch:** `openclaw/issue-1114/category-grouping-bug-plan`  
**Author:** Monk of Modularity (AI agent), subagent of Laoban  
**Priority:** P1 — production users seeing 500+ emails in wrong accordion  
**Linked issue:** #1114  

---

## Root Cause Analysis

### Primary Bug — `applyPostQueryFilters` silently drops category filter on UUID lookup failure

**Location:** `server/src/emails/emails.service.ts` → `applyPostQueryFilters`

**Code path:**
```ts
// applyPostQueryFilters (emails.service.ts ~865)
const idToName = new Map<string, string>();
for (const ctx of categoryContexts) {
  const categoryName = ctx.contextValue.split(" - ")[0].trim();
  idToName.set(ctx.contextId, categoryName);
}
categoryFilterNames = filters.categoryIds
  .map((id) => idToName.get(id))
  .filter((name): name is string => name !== undefined);
// ↑ If NO UUID resolves (UUID stale/not found), categoryFilterNames = []
```

Then:
```ts
if (categoryFilterNames && categoryFilterNames.length > 0) {
  // If categoryFilterNames is empty [], this entire block is SKIPPED
  filteredEmails = filteredEmails.filter(...)
}
// ↑ Returns ALL emails when no UUID matches!
```

**What happens:** When `filters.categoryIds` is non-empty but no UUID resolves to a known category name, the filter is silently skipped. ALL emails for the mode are returned instead of 0.

This triggers the downstream catastrophe:

1. `updateCategoryEmails({ categoryKey: UUID-CF, emails: ALL_500+ })` is dispatched
2. The reducer stamps ALL 500+ emails with `category_id = UUID-CF` (Customer Feedback UUID)
3. `groupEmailsByCategory` groups ALL 500+ emails under UUID-CF
4. The Customer Feedback accordion shows 500+ wrong emails

### Secondary Bug — Stale summary cache causes UUID mismatch

**Location:** `client/src/utils/emailCache.ts` + `client/src/hooks/useEmailFetching.ts`

The stale-while-revalidate pattern serves the old summary from localStorage cache **first**, then background-refreshes. If a category UUID changes between sessions (category renamed, deleted + recreated, or user account context reset), the cached summary has old UUIDs. When the user expands an accordion, the client sends the stale UUID to the backend. The backend fails to resolve it → primary bug triggers.

**Stale summary cache key:** `bearlymail_v1_summary_<mode>`  
**No TTL is enforced** — the cache is checked against `INBOX_CACHE_TTL_MS = 60_000` only for summary, but `getCachedSummary` returns without TTL check:

```ts
// emailCache.ts - getCachedSummary doesn't check TTL
export function getCachedSummary(mode: string): CategorySummaryItem[] | null {
  return safeGet<CategorySummaryItem[]>(summaryKey(mode));
}
```

`safeGet` returns the payload regardless of age. The `INBOX_CACHE_TTL_MS` constant is defined but **never used in `getCachedSummary`** — it's a dead constant.

### Tertiary Issue — `updateCategoryEmails` force-stamps `category_id` overriding server data

**Location:** `client/src/store/slices/emailSlice.ts`

```ts
const stampedEmails = emails.map(email => ({ ...email, category_id: categoryKey }));
```

This overwrites the server-provided `category_id` with `categoryKey` (the accordion's UUID). Intended as a reliability measure, but if `categoryKey` is itself stale (from a stale summary), it perpetuates wrong categorisation. Not the direct cause, but means any server-side enrichment is irrelevant.

---

## Fix Plan

### Fix 1 (P1 — Backend): Return empty when UUID doesn't resolve in `applyPostQueryFilters`

**File:** `server/src/emails/emails.service.ts`

**Change:** If `categoryIds` is non-empty but resolves to no known category names, treat it as "no matching emails" (return `{ emails: [], total: 0, hasMore: false }`) rather than skipping the filter.

```ts
// BEFORE
categoryFilterNames = filters.categoryIds
  .map((id) => idToName.get(id))
  .filter((name): name is string => name !== undefined);
// If empty → filter skipped → ALL emails returned

// AFTER
categoryFilterNames = filters.categoryIds
  .map((id) => idToName.get(id))
  .filter((name): name is string => name !== undefined);

if (filters.categoryIds.length > 0 && categoryFilterNames.length === 0) {
  // All requested UUIDs are unknown — this means stale client UUIDs.
  // Return empty rather than all emails (a stale UUID is not "no filter").
  this.logger.warn(
    `applyPostQueryFilters: categoryIds [${filters.categoryIds.join(', ')}] resolved to no known categories. Returning empty result. This indicates stale client-side category UUIDs.`
  );
  filteredEmails = [];
}
```

Also apply the same defensive guard in `getInboxSummary` (around line 502):

```ts
// getInboxSummary ~502
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const idToName = new Map<string, string>();
  categoryNameToId.forEach((id, name) => idToName.set(id, name));
  const categoryNamesFromIds = filters.categoryIds
    .map((id) => idToName.get(id))
    .filter((name): name is string => name !== undefined);
  
  // NEW: if all UUIDs are unknown, show nothing (stale filter, not missing filter)
  if (categoryNamesFromIds.length === 0) {
    visibleCategories = [];
  } else {
    visibleCategories = categoryOrder.filter(cat => categoryNamesFromIds.includes(cat));
  }
}
```

### Fix 2 (P1 — Frontend): Enforce TTL on summary cache reads + invalidate on UUID mismatch

**File:** `client/src/utils/emailCache.ts`

The `INBOX_CACHE_TTL_MS` constant exists in `useEmailFetching.ts` but is never used to gate `getCachedSummary`. Add TTL enforcement:

```ts
// emailCache.ts - replace getCachedSummary
export function getCachedSummary(mode: string): CategorySummaryItem[] | null {
  try {
    const raw = localStorage.getItem(summaryKey(mode));
    if (!raw) return null;
    const entry: CachedEntry<CategorySummaryItem[]> = JSON.parse(raw);
    const ageMs = Date.now() - entry.timestamp;
    if (ageMs > SUMMARY_CACHE_TTL_MS) {
      localStorage.removeItem(summaryKey(mode));
      return null;
    }
    return entry.payload;
  } catch {
    return null;
  }
}

// Export the TTL constant so useEmailFetching can reference it
export const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

Remove the dead `INBOX_CACHE_TTL_MS` constant from `useEmailFetching.ts` and use `SUMMARY_CACHE_TTL_MS` from `emailCache.ts`.

### Fix 3 (P1 — Frontend): Detect stale category UUIDs and bust summary cache

**File:** `client/src/hooks/useEmailFetching.ts` — `serveCategoryFromCacheAndRefresh` and `fetchCategoryEmailsImpl`

When the server returns 0 emails for a UUID that the summary says has N>0 emails, the UUID is likely stale. Clear the summary cache and trigger a re-fetch:

```ts
// In fetchCategoryEmailsImpl, after the successful fetch:
const emails: Email[] = response.data.emails;

// Detect UUID staleness: if the server returned 0 emails but the
// summary count for this category is > 0, the UUID is stale.
// Clear summary cache and re-fetch to get fresh UUIDs.
if (emails.length === 0) {
  const cachedSummary = getCachedSummary(mode);
  const summaryEntry = cachedSummary?.find(cat => getCategoryKey(cat.id, cat.name) === catKey);
  if (summaryEntry && summaryEntry.count > 0) {
    console.warn('[Accordion] Zero emails returned for category with non-zero summary count. Stale UUID suspected. Busting summary cache.', catKey);
    clearCacheForMode(mode);
    dispatch(clearCategoryState());
    // Re-trigger the summary fetch
    dispatch(setSummaryLoading(true));
    return;
  }
}
```

This creates a self-healing feedback loop: stale UUID detected → summary cache cleared → fresh summary fetched → correct UUIDs → correct accordion grouping.

### Fix 4 (Medium — Backend): Add `category_id` to getInbox response validation

**File:** `server/src/emails/emails.service.ts` — `getInbox`

Add a log warning when `getCategoryNameToIdMap` returns no mapping for a known category name. This surfaces DB/sync issues earlier:

```ts
// After enrichment loop:
for (const email of finalEmails) {
  const emailWithMeta = email as Email & { category_id?: string | null };
  const categoryName = (email as Email & { category?: string | null }).category;
  emailWithMeta.category_id = categoryName
    ? (categoryNameToId.get(categoryName) ?? null)
    : null;
  
  // NEW: warn when a category name has no UUID
  if (categoryName && !categoryNameToId.has(categoryName)) {
    this.logger.warn(
      `getInbox: email ${emailWithMeta.id} has category "${categoryName}" with no UserContext UUID. This email will fall back to name-based grouping.`
    );
  }
}
```

### Fix 5 (Medium — Frontend): Don't override server `category_id` in reducer

**File:** `client/src/store/slices/emailSlice.ts` — `updateCategoryEmails`

The force-stamp `category_id = categoryKey` was meant to ensure stability, but it's dangerous. Trust the server's `category_id` when provided; only fall back to `categoryKey` when the server didn't supply one:

```ts
// BEFORE
const stampedEmails = emails.map(email => ({ ...email, category_id: categoryKey }));

// AFTER
const stampedEmails = emails.map(email => ({
  ...email,
  // Trust the server's category_id when present; use the fetch key as fallback only.
  // This prevents the reducer from overwriting a correct server UUID with a potentially
  // stale categoryKey derived from an old summary.
  category_id: email.category_id ?? categoryKey,
}));
```

**Note:** This is a secondary improvement. The primary fix (Fix 1) is the critical one.

---

## Files to Change

| File | Change |
|------|--------|
| `server/src/emails/emails.service.ts` | Fix 1: Return empty when UUID resolves to nothing in `applyPostQueryFilters` and `getInboxSummary` |
| `server/src/emails/emails.service.ts` | Fix 4: Add warning log when category name has no UUID |
| `client/src/utils/emailCache.ts` | Fix 2: Enforce TTL on `getCachedSummary` |
| `client/src/hooks/useEmailFetching.ts` | Fix 2+3: Remove dead `INBOX_CACHE_TTL_MS`, add stale UUID detection |
| `client/src/store/slices/emailSlice.ts` | Fix 5: Trust server `category_id` instead of force-stamping |

---

## Tests to Add / Update

1. **`emails.service.spec.ts`** — unit test: `applyPostQueryFilters` with `categoryIds = ['unknown-uuid']` returns empty, not all emails.
2. **`emails.service.spec.ts`** — unit test: `getInboxSummary` with unknown UUID filter returns empty categories.
3. **`emailCache.test.ts`** — unit test: `getCachedSummary` returns null when cache is older than `SUMMARY_CACHE_TTL_MS`.
4. **`useEmailFetching.test.ts`** (if exists) — test stale UUID detection triggers cache bust.
5. **`emailSlice.test.ts`** — test `updateCategoryEmails` with server-provided `category_id` preserves it instead of overwriting.

---

## Rollout Risk

- **Fix 1 (backend):** Behaviour change for existing users with stale client UUIDs. They will see an empty accordion instead of all emails. This is the correct behaviour and the cache will self-heal within one refresh cycle (the background refresh in `serveSummaryFromCacheAndRefresh` will update the UUID). **Low risk, high value.**
- **Fix 2 (cache TTL):** Means stale-while-revalidate window is now max 5 minutes instead of indefinite. Slightly more API calls for long-session users. **Low risk.**
- **Fix 3 (stale UUID detection):** Self-healing. Only triggers when server returns 0 for a non-zero category. **Low risk.**
- **Fix 5 (stop overwriting category_id):** The server already enriches `category_id` correctly. This change removes redundant client override. The guard `email.category_id ?? categoryKey` means existing behaviour is preserved when the server returns no category_id. **Low risk.**

---

## Investigation Notes (for Codebeard)

- The bug was introduced/exposed by commit `2854f1e` (`fix(#1090): use category UUIDs instead of names in inbox API calls`). That commit made the switch to UUID-only filtering. Previously, name-based fallback masked the empty-UUID-resolution case.
- The `INBOX_CACHE_TTL_MS = 60_000` constant in `useEmailFetching.ts` is defined but never passed to `getCachedSummary`. Dead code — fix or use it.
- The `emailCache.ts` `categoryKey` function sanitises UUIDs by replacing non-alphanumeric chars with `_`. UUID hyphens become underscores. This is safe but worth noting.
- The stale summary cache scenario requires the user to have the cache from a session where category UUIDs were different (e.g., production deployment that reset `UserContext` IDs, or a user who had the old category setup).

Signed-off-by: Monk of Modularity (AI agent), subagent of Laoban
