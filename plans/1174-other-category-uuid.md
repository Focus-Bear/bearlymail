# Plan: Fix "Other" category showing 0 emails after PR #1148 UUID-first filtering

**Issue:** #1174  
**Branch:** `openclaw/issue-1174/other-category-plan`  
**Severity:** P1 — "Other" category (catch-all for uncategorised threads) shows 0 emails for all users  
**Root cause confirmed:** ✅ (see investigation below)

---

## Root Cause Analysis

### 1. What PR #1148 changed

PR #1148 switched category filtering from name-string matching to UUID-first matching via `thread.categoryId`. The client now **always** sends `categoryIds=<key>` in requests. The `categoryKey` for a category is computed by `getCategoryKey(id, name)` which returns `id ?? name`.

### 2. Why "Other" breaks

**"Other" is a virtual catch-all category with no `user_contexts` entry.** This means:

- `getInboxSummary` returns `{ id: null, name: "Other", count: N }` for uncategorised threads  
  (because `lookupCategoryId("Other")` returns `null` — "Other" has no UUID in `categoryNameToId`)
- `getCategoryKey(null, "Other")` → returns `"Other"` (the string, not a UUID)
- The client sends `categoryIds=Other` (a plain name string, not a UUID)
- Server parses this as `categoryIdList = ["Other"]`

### 3. Where both server functions fail

#### `applyPostQueryFilters` (line ~1190)

```typescript
const requestedUuids = new Set(filters.categoryIds); // = Set {"Other"}

// Build idToName from userContextRepository — "Other" has no entry here
const idToName = new Map<string, string>(); // no "Other" entry

const requestedNames = new Set(
  filters.categoryIds
    .map((id) => idToName.get(id))  // idToName.get("Other") → undefined
    .filter((name): name is string => name !== undefined),
);
// requestedNames = Set {} (EMPTY!)

// Fix #1114 guard: 0 resolved names → RETURN EMPTY []
if (requestedNames.size === 0) {
  return { emails: [], blockedCount: 0 };  // ← THIS is why Other shows 0 emails
}
```

#### `getInboxSummary` (line ~538)

Same pattern:
```typescript
const categoryNamesFromIds = new Set(
  filters.categoryIds
    .map((id) => idToName.get(id))  // idToName.get("Other") → undefined
    ...
);
// categoryNamesFromIds = Set {} (EMPTY!)

if (categoryNamesFromIds.size === 0) {
  return { total: 0, categories: [] };  // ← blocks the count too
}
```

### 4. The `llm-processor.ts` confirms design intent

In `llm-processor.ts`, when a thread is categorised as "Other":
- `categoryId` is explicitly set to `null` (line ~1532: `categoryId = null`)
- The `lookupCategoryContextId` helper explicitly returns `null` for "Other" (line ~1493)
- This is **by design** — "Other" threads intentionally have no UUID

### 5. Why the fallback path doesn't rescue it

The fallback (name-based match for pre-backfill threads) is only reached if `requestedNames.size > 0`. Because "Other" is not in `idToName`, `requestedNames` is empty, and the Fix #1114 guard fires early — before the fallback is ever tried.

---

## The Fix

"Other" is a sentinel value that doesn't map to a UUID. The filtering logic needs to detect it and handle it specially, rather than treating it as a stale/invalid UUID.

### Strategy

When `categoryIds` contains the string `"Other"` (or a UUID that resolves to the "Other" sentinel), the filter should match threads where `categoryId IS NULL OR category decrypts to "Other"`.

### Changes required

#### A. `server/src/emails/emails.service.ts` — `applyPostQueryFilters`

**Before:** (lines ~1190–1224)
```typescript
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const requestedUuids = new Set(filters.categoryIds);
  const categoryContexts = await this.userContextRepository.find({ ... });
  const idToName = new Map<string, string>();
  for (const ctx of categoryContexts) {
    const categoryName = ctx.contextValue.split(" - ")[0].trim();
    idToName.set(ctx.contextId, categoryName);
  }
  const requestedNames = new Set(
    filters.categoryIds.map((id) => idToName.get(id)).filter(...)
  );
  if (requestedNames.size === 0) {
    return { emails: [], blockedCount: 0 };
  }
  // ... filter loop
}
```

**After:**
```typescript
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const requestedUuids = new Set(filters.categoryIds);

  // Special case: "Other" is a virtual catch-all with no UUID.
  // The client sends the string "Other" as the categoryKey (getCategoryKey returns id ?? name,
  // and Other has id=null). Detect this and handle it before the UUID→name resolution.
  const otherRequested = requestedUuids.has("Other");

  // Remove "Other" from UUID set so it doesn't poison the UUID→name resolution
  if (otherRequested) requestedUuids.delete("Other");

  // Build idToName for real UUID-backed categories
  const categoryContexts = await this.userContextRepository.find({ ... });
  const idToName = new Map<string, string>();
  for (const ctx of categoryContexts) {
    const categoryName = ctx.contextValue.split(" - ")[0].trim();
    idToName.set(ctx.contextId, categoryName);
  }
  const requestedNames = new Set(
    [...requestedUuids].map((id) => idToName.get(id)).filter(...)
  );

  // Fix #1114 guard: only fire if no real UUIDs resolved AND "Other" was not requested.
  // (If only "Other" was requested, requestedNames will be empty but that's valid.)
  if (requestedNames.size === 0 && !otherRequested) {
    return { emails: [], blockedCount: 0 };
  }

  // ... filter loop — update to include Other match:
  filteredEmails = filteredEmails.filter((emailEntry) => {
    const emailWithMeta = emailEntry as Email & {
      categoryId?: string | null;
      category?: string | null;
    };
    const effectiveCategory = emailWithMeta.category || "Other";

    // Match "Other" (null categoryId or category === "Other")
    if (otherRequested && (effectiveCategory === "Other" || !emailWithMeta.categoryId)) {
      return true;
    }

    // Primary path: UUID equality
    if (emailWithMeta.categoryId) {
      return requestedUuids.has(emailWithMeta.categoryId);
    }
    // Fallback path: name-based match for pre-backfill threads
    return requestedNames.has(effectiveCategory);
  });
}
```

#### B. `server/src/emails/emails.service.ts` — `getInboxSummary`

Same pattern. The `visibleCategories` filter must allow "Other" through when `categoryIds` contains `"Other"`.

**Before:** (lines ~538–556)
```typescript
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const requestedUuids = new Set(filters.categoryIds);
  const idToName = new Map...
  const categoryNamesFromIds = new Set(...)
  if (categoryNamesFromIds.size === 0) {
    return { total: 0, categories: [] };
  }
  visibleCategories = categoryOrder.filter((cat) => {
    const uuid = categoryUuidByName.get(cat);
    if (uuid) return requestedUuids.has(uuid);
    return categoryNamesFromIds.has(cat);
  });
}
```

**After:**
```typescript
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const otherRequested = filters.categoryIds.includes("Other");
  const uuidsWithoutOther = filters.categoryIds.filter(id => id !== "Other");
  const requestedUuids = new Set(uuidsWithoutOther);

  const idToName = new Map...
  const categoryNamesFromIds = new Set(
    uuidsWithoutOther.map((id) => idToName.get(id)).filter(...)
  );

  // Fix #1114: only treat as stale when real UUIDs exist but none resolve
  // AND "Other" was not the only thing requested.
  if (categoryNamesFromIds.size === 0 && !otherRequested) {
    return { total: 0, categories: [] };
  }

  visibleCategories = categoryOrder.filter((cat) => {
    // "Other" is always matched by name, never by UUID
    if (cat === "Other") return otherRequested;
    // Primary: UUID match via per-category UUID tracked during grouping
    const uuid = categoryUuidByName.get(cat);
    if (uuid) return requestedUuids.has(uuid);
    // Fallback: name match for threads not yet backfilled
    return categoryNamesFromIds.has(cat);
  });
}
```

#### C. No client changes needed

The client correctly sends `categoryIds=Other` because `getCategoryKey(null, "Other") === "Other"`. The fix is purely server-side.

#### D. No `user_contexts` changes needed

"Other" must remain a virtual category with no UUID — this is by design. Adding a real `UserContext` row for "Other" would break the proto-category promotion logic in `llm-processor.ts`.

---

## Files to change

| File | Section | Change |
|------|---------|--------|
| `server/src/emails/emails.service.ts` | `applyPostQueryFilters` (~line 1190) | Detect `"Other"` in `categoryIds`, short-circuit Fix #1114 guard, include Other in filter predicate |
| `server/src/emails/emails.service.ts` | `getInboxSummary` (~line 538) | Same pattern — detect `"Other"`, allow it through `visibleCategories` filter |

---

## Tests to add/update

- `server/src/emails/applyPostQueryFilters.spec.ts` — add case: `categoryIds: ["Other"]` returns threads with null categoryId or category === "Other"
- `server/src/emails/applyPostQueryFilters.spec.ts` — add case: `categoryIds: ["Other"]` does NOT fire Fix #1114 empty-result guard
- `server/src/emails/emails.service.ts` (getInboxSummary) — add unit test for `categoryIds: ["Other"]` returning correct count

---

## Regression risk

**Low.** The change is additive:
- The Fix #1114 guard is preserved for genuine stale UUIDs (all UUIDs that aren't "Other")
- The fallback name-based path is preserved for pre-backfill threads
- "Other" detection is a simple string check on a value the client already sends

The only risk is if a real category UUID somehow equals the string `"Other"`, which is impossible (UUIDs are hex with dashes, not plain English words).

---

## Decision log

- **Why not add "Other" to `user_contexts`?** Would break `llm-processor.ts` proto-category logic and the intent of "Other" as a virtual bucket. The server already treats `categoryId=null` as "Other" explicitly.
- **Why not change the client to send `categoryIds=null`?** `null` is not a valid URL parameter value. The current `"Other"` string is the correct sentinel.
- **Why fix both `applyPostQueryFilters` and `getInboxSummary`?** `getInboxSummary` drives the count badge; `applyPostQueryFilters` drives the email list. Both need to return results for "Other" to work end-to-end.

---

*Plan authored by Monk of Modularity | Issue #1174 | 2026-03-18*
