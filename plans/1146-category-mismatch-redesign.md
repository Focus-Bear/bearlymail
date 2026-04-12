# Plan: Fix #1146 — Category Filter UUID Mismatch (Redesigned)

**Issue:** [#1146](https://github.com/Focus-Bear/BearlyMail/issues/1146)  
**Previous PR:** [#1148](https://github.com/Focus-Bear/BearlyMail/pulls/1148) — **rejected** (fuzzy name matching)  
**Approach:** Store `categoryId` UUID on `email_threads` at categorisation time; filter by UUID directly.

---

## Root Cause (Definitive)

The category filter pipeline has a fundamental impedance mismatch:

1. **Client sends:** `categoryIds=<uuid>` — a `UserContext.contextId` UUID
2. **Server resolves:** UUID → name string via `userContextRepository` (exact match on `contextValue`)
3. **Server filters:** `thread.category === canonicalName` — string equality on an **encrypted name column**

The problem is step 3. `email_threads.category` stores the name returned by the LLM at categorisation time. The LLM frequently deviates from the canonical name (e.g. stores `"Build/deployment errors other repos"` instead of `"Build/deployment errors (other repos)"`). The encrypted name doesn't match, so threads fall through.

PR #1148 attempted to fix this with fuzzy matching in `applyPostQueryFilters`. Jeremy correctly rejected this — fuzzy matching is fragile and the wrong layer to solve it. The fix must be **structural**.

---

## Correct Fix: Store UUID at Categorisation Time

### Why This Works

At the point where `email_threads.category` is written (in `llm-processor.ts`), the code already has access to the user's `UserContext` list. We know which `UserContext.contextId` maps to each category name **at write time**, before any LLM deviation can corrupt the lookup. Store that UUID in a new `categoryId` column. Then filter by `thread.categoryId = $uuid` — no name resolution needed, ever.

### Key Finding: `UserContext.contextId` Is the UUID

The `user_contexts` table uses `@PrimaryGeneratedColumn("uuid")` named **`contextId`** (not `id`). This is what the client sends as `categoryIds`. Confirmed in `user-context.entity.ts`.

---

## Changes Required

### 1. Migration: Add `categoryId` UUID Column to `email_threads`

**File:** `server/src/database/migrations/1785000000000-AddCategoryIdToEmailThreads.ts`

```typescript
export class AddCategoryIdToEmailThreads1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE email_threads
      ADD COLUMN IF NOT EXISTS "categoryId" uuid NULL
    `);
    // No FK constraint intentionally — UserContext rows can be deleted
    // without cascading thread deletions. Nullable means "not yet resolved".
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE email_threads
      DROP COLUMN IF EXISTS "categoryId"
    `);
  }
}
```

### 2. Entity: Add `categoryId` Field to `EmailThread`

**File:** `server/src/database/entities/email-thread.entity.ts`

Add after `category` and `categoryExplanation` columns:

```typescript
@Column({
  type: "uuid",
  nullable: true,
  comment:
    "UUID of the UserContext EMAIL_CATEGORY entry for this thread's category. " +
    "Set at categorisation time to enable direct UUID filtering without name resolution.",
})
categoryId: string | null;
```

No `@ManyToOne` relation — `UserContext` rows can be deleted without cascading thread changes.

### 3. `llm-processor.ts`: Set `categoryId` Alongside `category`

Two write sites need updating:

#### A. Summarisation path (`processSummaryBatch`, ~line 1059–1078)

After resolving `canonicalCategory` via `findMatchingFullCategory`, look up the `contextId` from the already-available `contexts` array:

```typescript
if (category && email.emailThreadId) {
  let canonicalCategory = category;
  let resolvedCategoryId: string | null = null;

  if (category !== "Other") {
    const matched = await this.protoCategoriesService.findMatchingFullCategory(
      jobEntry.userId,
      category,
    );
    if (matched) {
      canonicalCategory = matched.name;
      resolvedCategoryId = matched.contextId; // ← contextId from UserContext
    }
  }

  await this.emailThreadRepository.update(
    { id: email.emailThreadId },
    {
      category: canonicalCategory,
      categoryExplanation: categoryExplanation ?? undefined,
      categoryId: resolvedCategoryId,
    },
  );
}
```

> **Note:** `findMatchingFullCategory` currently returns `string | null` (the name). It must be updated to return `{ name: string; contextId: string } | null` so the UUID is available.

#### B. Priority path (`resolveCategoryAndProtoCategory` result → `emailThreadRepository.update`, ~line 1207)

The priority path resolves `finalCategory` via `resolveCategoryAndProtoCategory`. This function builds `knownCategoryNames` from `contexts` but discards the `contextId`. Update `resolveCategoryAndProtoCategory` to also return `finalCategoryId: string | null`:

```typescript
// In resolveCategoryAndProtoCategory:
// Build a contextId lookup map alongside name matching
const knownCategories = contexts
  .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
  .map((ctx) => ({
    name: ctx.contextValue.split(" - ")[0].trim(),
    contextId: ctx.contextId,
  }));

// ... existing logic ...

// At the end, look up contextId for finalCategory
const finalCategoryId =
  finalCategory && finalCategory !== "Other"
    ? (knownCategories.find((c) => c.name === finalCategory)?.contextId ?? null)
    : null;

return { finalCategory, protoCategoryId, finalCategoryId };
```

Then in the `emailThreadRepository.update` call:

```typescript
await this.emailThreadRepository.update(
  { id: email.emailThreadId },
  {
    urgencyScore: newUrgencyScore,
    urgencyExplanation: ...,
    priorityExplanation,
    priorityScore: finalScore,
    category: finalCategory,
    categoryId: finalCategoryId,    // ← add this
    categoryExplanation: resolvedCategoryExplanation,
    protoCategoryId,
    isProcessingPriority: false,
  },
);
```

### 4. `emails.service.ts`: Filter by `thread.categoryId` Directly

#### A. `applyPostQueryFilters`

Replace the entire UUID→name→string-equality filter with a direct UUID comparison:

```typescript
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  const uuids = filters.categoryIds;

  filteredEmails = filteredEmails.filter((emailEntry) => {
    const threadCategoryId = (
      emailEntry as Email & { categoryId?: string | null }
    ).categoryId;

    // Direct UUID match — no name resolution needed
    if (threadCategoryId && uuids.includes(threadCategoryId)) return true;

    // Fallback: "Other" / null threads — client may pass a synthetic "Other" key
    const isOther = !threadCategoryId;
    // (Handle "Other" sentinel if needed — see §5 below)
    return false;
  });
}
```

**Remove** the entire `userContextRepository.find` + `idToName` block from `applyPostQueryFilters`.

#### B. `getInboxSummary`

Replace the UUID→name filter with a direct UUID comparison on `categoryId`:

```typescript
// In getInboxSummary SQL query, SELECT thread.categoryId as well:
const selectParts = ['thread.category', 'thread."categoryId"', ...];

// When building category counts, key by categoryId (UUID) instead of name:
// Then filter:
if (filters?.categoryIds && filters.categoryIds.length > 0) {
  visibleCategories = categoryOrder.filter((cat) =>
    uuids.includes(categoryIdForName.get(cat) ?? ""),
  );
}
```

More precisely, the summary row aggregation can be simplified: since we now have `categoryId` on the row, we can group by `categoryId` instead of decrypted name, which avoids decryption entirely for the aggregation step.

#### C. `getInbox` category_id enrichment (line ~863–875)

The existing enrichment block computes `category_id` from the decrypted name via fuzzy lookup. Replace with a direct read from `thread.categoryId`:

```typescript
// Before (fuzzy):
emailWithMeta.category_id = categoryName
  ? (lookupCategoryId(categoryName) ?? null)
  : null;

// After (direct):
emailWithMeta.category_id =
  (email as EmailThread & { categoryId?: string | null }).categoryId ?? null;
```

### 5. Handle "Other" in the Filter

`"Other"` threads have `categoryId = null` (no UserContext entry). The client currently sends a synthetic key for "Other". Two options:

**Option A (recommended):** The client's "Other" filter should send `categoryIds=OTHER_SENTINEL` (a known string constant, not a UUID). The server detects this sentinel and filters `thread.categoryId IS NULL AND thread.category = 'Other'` (or `category IS NULL`).

**Option B:** Never filter by "Other" as a UUID; instead add a separate `includeOther: boolean` filter param.

Either approach keeps "Other" out of the UUID path cleanly.

### 6. Backfill Migration

Existing threads have `categoryId = null`. A backfill is needed to populate `categoryId` for threads that already have a `category` name set.

**File:** `server/src/database/migrations/1785100000000-BackfillThreadCategoryId.ts`

```typescript
// Backfill logic (application-layer, because category is encrypted):
// At server startup, run a background job (like repairEncryptedCategoryNames)
// that:
//   1. Selects threads WHERE categoryId IS NULL AND category IS NOT NULL
//   2. Decrypts category
//   3. Looks up matching UserContext contextId (exact match first, then prefix)
//   4. Updates thread.categoryId

// The migration itself adds a flag column:
await queryRunner.query(`
  ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS "needsCategoryIdBackfill" boolean NOT NULL DEFAULT false
`);
await queryRunner.query(`
  UPDATE email_threads
  SET "needsCategoryIdBackfill" = true
  WHERE category IS NOT NULL AND "categoryId" IS NULL
`);
```

The application repair method `repairEncryptedCategoryNames` (already exists) can be extended to also populate `categoryId` during its repair pass, or a new method `backfillThreadCategoryIds` can be added to `EmailsService.onModuleInit`.

---

## What Changes Where (Summary)

| File                                                      | Change                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `migrations/1785000000000-AddCategoryIdToEmailThreads.ts` | New migration: add `categoryId uuid NULL` column                                                                        |
| `migrations/1785100000000-BackfillThreadCategoryId.ts`    | New migration: flag rows for backfill                                                                                   |
| `entities/email-thread.entity.ts`                         | Add `categoryId: string \| null` column                                                                                 |
| `emails/llm-processor.ts`                                 | Set `categoryId` at both write sites (summary + priority)                                                               |
| `proto-categories/proto-categories.service.ts`            | `findMatchingFullCategory` returns `{ name, contextId }` not just `string`                                              |
| `emails/emails.service.ts`                                | Filter by `thread.categoryId` directly; remove UUID→name→equality chain; add `backfillThreadCategoryIds` startup method |

---

## What This Eliminates

- `canonicaliseCategoryName` fuzzy matching in filter path ← **removed entirely from filter**
- `idToName` reverse lookup in `applyPostQueryFilters` ← **removed**
- `categoryNamesFromIds` + string equality filter ← **replaced with UUID equality**
- The `needsCategoryRepair` repair job is still needed for historical data but becomes a one-time cleanup, not a permanent runtime dependency

---

## What Stays (No Change)

- `needsCategoryRepair` + `repairEncryptedCategoryNames` — still useful to clean up old deviated names in `category` column (affects display only, not filtering)
- `canonicaliseCategoryName` — still called at **write time** to ensure `category` column stores clean names for display. NOT used in filter path.
- `getInboxSummary` category display names — still read from decrypted `thread.category` for the human-readable label. Only the **filter** switches to UUID.

---

## Authorship

Designed by Monk of Modularity (OpenClaw subagent).  
Supersedes the fuzzy-matching approach in PR #1148.  
Ready for Codebeard implementation.
