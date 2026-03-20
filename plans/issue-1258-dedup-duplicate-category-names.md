# Plan: Fix Duplicate Category Names in Inbox (#1258)

**Issue:** Duplicate category names appear in the inbox (e.g. "Build/deployment errors other repos" shows twice with different email counts; the first instance is unclickable).

**Priority:** P1 — breaks inbox UX; users see ghost categories they can't interact with.

---

## Root Cause Analysis

### How duplicates are created

The `user_contexts` table stores categories with `contextKey = EMAIL_CATEGORY`. Each row gets a unique UUID (`contextId`). **There is no uniqueness constraint on `(userId, contextKey, contextValue)`**, so multiple rows can exist with the same category name for the same user.

Duplicate name entries are created through multiple independent code paths:

1. **`ContextCategoryService.saveCategoriesToDb()`** (context-category.service.ts:280) — saves categories in a loop via `this.contextRepository.create()` + `.save()` with NO check for existing categories with the same name. Called from:
   - `consolidateExistingCategories()` — manual consolidation button
   - `generateCategoriesFromOther()` — auto-generates categories from "Other" emails

2. **`ContextService` context analysis** (context.service.ts:3710-3721) — bulk-saves new context items after LLM analysis. It deletes existing auto-generated entries first, but user-edited entries survive. If the LLM suggests a category with the same name as a user-edited one, a duplicate is created.

3. **Race conditions** — concurrent LLM processing jobs can each call `findMatchingFullCategory()` (proto-categories.service.ts:213), find no match (because neither has committed yet), and both create new UserContext entries with the same name.

### How duplicates surface in the inbox

In `getInboxSummary()` (emails.service.ts:331):

- Threads are grouped by **decrypted category name** (`categoryCounts`, `categoryOrder`).
- `categoryUuidByName` tracks **only the first-seen UUID** per category name (line 529: `if (!categoryUuidByName.has(category))`).
- The response returns `categories` with `id = categoryUuidByName.get(name)` — so all threads with the same category name get merged into ONE summary entry here.

**BUT** — the `categoryNameToId` map (line 458) is built from UserContext rows. If two UserContext rows have the same category name, `categoryNameToId` keeps **only the last one** (Map.set overwrites). This means:

- Threads with `categoryId = UUID-A` (first UserContext row) get grouped under the same name as threads with `categoryId = UUID-B` (second UserContext row).
- `categoryUuidByName` picks whichever UUID it sees first from the thread data.
- When filtering by category UUID, the mismatch between `categoryUuidByName` and `categoryNameToId` can cause categories to appear but be unclickable (clicking sends UUID-A but the filter resolves to UUID-B, or vice versa).

### Frontend rendering

In `InboxContentParts.tsx` (line 434), categories are rendered with `key={categoryKey}` where `categoryKey = getCategoryKey(id, name)` (returns `id ?? name`). If two categories have different UUIDs but the same name, they render as separate items — creating the visible duplicate. However, `getInboxSummary` currently merges by name, so the duplicate must originate from the frontend receiving stale cached data or from concurrent summary fetches returning different UUID mappings.

The most likely scenario: the server returns the same category name with UUID-A on one fetch and UUID-B on another (due to the `categoryNameToId` last-write-wins behavior), and the frontend's `stableCategoryOrder` retains both keys.

---

## Fix Plan — Three Levels

### Level 1: Server dedup in `getInboxSummary` (read-path defense)

**File:** `server/src/emails/emails.service.ts`

**What:** After building `categoryNameToId` from UserContext, detect and merge duplicate names.

**Changes:**

1. In `getInboxSummary()`, after building `categoryNameToId` (line 458-463), add dedup logic:

```typescript
// Dedup: if multiple UserContext rows have the same category name,
// keep the oldest (first-created) UUID as canonical. Log a warning.
const categoryContextsByName = new Map<string, UserContext[]>();
for (const ctx of categoryContexts) {
  const categoryName = ctx.contextValue.split(" - ")[0].trim();
  const existing = categoryContextsByName.get(categoryName) || [];
  existing.push(ctx);
  categoryContextsByName.set(categoryName, existing);
}

const categoryNameToId = new Map<string, string>();
for (const [name, contexts] of categoryContextsByName.entries()) {
  if (contexts.length > 1) {
    this.logger.warn(
      `[getInboxSummary] Duplicate category name "${name}" found: ${contexts.length} entries (${contexts.map(c => c.contextId).join(', ')}). Using oldest.`,
    );
  }
  // Sort by createdAt ascending, pick first (oldest = canonical)
  contexts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  categoryNameToId.set(name, contexts[0].contextId);
}
```

2. Add `createdAt` to the `select` clause for categoryContexts query (line 449-454).

### Level 2: Prevention — Enforce category name uniqueness at write time

**File:** `server/src/context/context-category.service.ts`

**What:** Before saving a new category, check if one with the same name already exists for the user.

**Changes to `saveCategoriesToDb()`:**

```typescript
private async saveCategoriesToDb(
  userId: string,
  categories: Array<{ name: string; description: string }>,
): Promise<void> {
  // Fetch existing category names to prevent duplicates
  const existing = await this.contextRepository.find({
    where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    select: ['contextId', 'contextValue'],
  });
  const existingNames = new Set(
    existing.map(ctx => ctx.contextValue.split(' - ')[0].trim().toLowerCase()),
  );

  for (const cat of categories) {
    if (existingNames.has(cat.name.toLowerCase().trim())) {
      this.logger.log(
        `[saveCategoriesToDb] Skipping duplicate category "${cat.name}" for user ${userId}`,
      );
      continue;
    }
    const contextValue = `${cat.name} - ${cat.description}`;
    const newContext = this.contextRepository.create({
      userId,
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue,
      source: Source.AUTOGENERATED,
    });
    await this.contextRepository.save(newContext);
    existingNames.add(cat.name.toLowerCase().trim());
  }
}
```

**File:** `server/src/context/context.service.ts`

**What:** In the context analysis save path (line 3710-3721), after deleting old auto-generated entries, also check against surviving user-edited entries before saving.

**Changes:**

After the `delete` at line 3708 and before `save` at line 3721, filter out items whose names collide with existing user-edited categories:

```typescript
// Fetch surviving user-edited categories to avoid name collisions
const userEditedCategories = await this.contextRepository.find({
  where: { userId, contextKey: ContextKey.EMAIL_CATEGORY, source: Source.USER_EDITED },
  select: ['contextValue'],
});
const userEditedNames = new Set(
  userEditedCategories.map(ctx => ctx.contextValue.split(' - ')[0].trim().toLowerCase()),
);

const entities = toSave
  .filter(item => {
    if ((item.key as ContextKey) !== ContextKey.EMAIL_CATEGORY) return true;
    const name = item.value.split(' - ')[0].trim().toLowerCase();
    return !userEditedNames.has(name);
  })
  .map(item => this.contextRepository.create({ ... }));
```

### Level 3: Frontend defense — Merge duplicate names before rendering

**File:** `client/src/components/inbox/inboxCategoryHelpers.ts`

**What:** In `buildDisplayCategories()`, merge any entries with the same display name (combining counts, keeping the first UUID).

**Changes:**

```typescript
export function buildDisplayCategories(
  summaryCategories: CategorySummaryItem[] | null,
  filteredEmails: Email[],
  stableCategoryOrder: string[],
  mode: InboxMode
): Array<{ id: string | null; name: string; count: number }> {
  const source: Array<{ id: string | null; name: string; count: number }> =
    summaryCategories ??
    groupEmailsByCategory(filteredEmails, mode).map(grp => ({
      id: null,
      name: grp.category,
      count: grp.emails.length,
    }));

  // Merge entries with duplicate display names (server-side dedup is the
  // primary fix; this is a defensive frontend layer).
  const mergedByName = new Map<string, { id: string | null; name: string; count: number }>();
  for (const cat of source) {
    const existing = mergedByName.get(cat.name);
    if (existing) {
      existing.count += cat.count;
      // Keep first-seen UUID as canonical
    } else {
      mergedByName.set(cat.name, { ...cat });
    }
  }
  const mergedSource = Array.from(mergedByName.values());

  const nonEmptySource = mergedSource.filter(cat => cat.count > 0);
  if (stableCategoryOrder.length === 0) {
    return nonEmptySource;
  }
  const orderMap = new Map(stableCategoryOrder.map((key, idx) => [key, idx]));
  return nonEmptySource.slice().sort((itemA, itemB) => {
    const keyA = getCategoryKey(itemA.id, itemA.name);
    const keyB = getCategoryKey(itemB.id, itemB.name);
    const orderA = orderMap.get(keyA) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.get(keyB) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}
```

### Level 3b: Data cleanup migration

**File:** `server/src/database/migrations/XXXXXXXXX-DeduplicateCategoryNames.ts`

**What:** A migration that finds duplicate `user_contexts` rows with the same `(userId, contextKey=EMAIL_CATEGORY)` and matching category names, and deletes the newer duplicates. Since `contextValue` is encrypted, this must be done in application code (similar to the `RepairThreadCategoryNames` migration pattern):

1. Add a `needsCategoryDedup` boolean flag column on `user_contexts` (defaulting to false).
2. Set it to true for all `EMAIL_CATEGORY` rows.
3. On startup, a repair job decrypts, groups by `(userId, name)`, and deletes duplicates (keeping the oldest).
4. Update any `email_threads.categoryId` references pointing to deleted UUIDs to point to the surviving canonical UUID.

---

## Testing

1. **Unit test for `saveCategoriesToDb`**: Verify that inserting a category with a name that already exists is skipped.
2. **Unit test for `buildDisplayCategories`**: Verify that duplicate names are merged with combined counts.
3. **Unit test for `getInboxSummary`**: Verify that when multiple UserContext rows have the same name, only one category entry is returned with the correct combined count.
4. **Integration test**: Create two UserContext rows with the same category name but different UUIDs, create threads pointing to each UUID, and verify `getInboxSummary` returns a single merged category.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/emails/emails.service.ts` | Dedup `categoryNameToId` in `getInboxSummary()` |
| `server/src/context/context-category.service.ts` | Name uniqueness check in `saveCategoriesToDb()` |
| `server/src/context/context.service.ts` | Filter name collisions with user-edited categories before bulk save |
| `client/src/components/inbox/inboxCategoryHelpers.ts` | Merge duplicate names in `buildDisplayCategories()` |
| `client/src/components/inbox/inboxCategoryHelpers.test.ts` | Add test for duplicate name merging |
| `server/src/emails/emails.service.spec.ts` | Add test for dedup behavior |
| New migration file | Data cleanup for existing duplicate categories |

---

## Risk Assessment

- **Low risk**: Frontend merge is purely defensive and cannot break anything.
- **Low risk**: `getInboxSummary` dedup is a read-path change that makes existing behavior more robust.
- **Medium risk**: `saveCategoriesToDb` uniqueness check — must handle case sensitivity and whitespace correctly. The `toLowerCase().trim()` normalization matches existing patterns in `findMatchingFullCategory`.
- **Medium risk**: Data cleanup migration — must correctly update `email_threads.categoryId` foreign references. Should be tested on a staging DB first.

---

*Plan authored by Monk of Modularity 🧘*
*AI-generated plan — review before implementation*
