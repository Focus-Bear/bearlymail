# Plan: Fix Starred Emails Appearing in Triage (#1119)

## Issue Summary

Jeremy is still seeing starred emails in Triage after PR #1111 (which fixed
the localStorage cache removal). Investigation reveals **two independent bugs**:

1. **The `priorityModeActive` logic bypasses `starCount = 0` filter when
   `minPriority` is set**, and `minPriority` defaults to 50 (HIGH_PRIORITY_THRESHOLD)
   for first-time users.
2. **`inbox-summary` returns `id: null` for "Customer feedback (github issues
   or feedback forms)"** causing the client to bucket all emails under a null
   key — emails from different categories collapse into a single broken accordion.

---

## Root Cause Analysis

### Bug 1 — `priorityModeActive` Silently Disables the `starCount = 0` Filter

**Location:** `server/src/emails/emails.service.ts` — `runInboxQuery()` and
`getInboxSummary()`

**Code path:**
```ts
// useInboxFilters.ts
function loadInitialFilters(): InboxFilter {
  // First visit: defaults to high-priority filter
  return { accountIds: [], categories: [], minPriority: HIGH_PRIORITY_THRESHOLD }; // 50
}
```

```ts
// emails.service.ts — runInboxQuery()
const priorityModeActive =
  filters?.minPriority !== undefined && mode !== "blocked";

let threadFilter = priorityModeActive
  ? 'AND thread."isArchived" = false'                    // ← NO starCount filter!
  : 'AND thread."isArchived" = false AND thread."starCount" > 0';

if (!priorityModeActive) {
  if (mode === "triage") {
    threadFilter = 'AND thread."isArchived" = false AND thread."starCount" = 0'; // ← correct
  }
}
```

**The bug:** When `minPriority = 50` (the **default** on first load), the
server sets `priorityModeActive = true` and drops the `starCount = 0` guard
entirely. This means **any email with `priorityScore >= 50` appears in Triage
regardless of whether it has been starred** (starCount > 0).

The same logic exists in `getInboxSummary()` in the `threadFilter` assignment.

**Why it was written this way:** PR #1056 introduced priority filtering so
that a combined "priority inbox" across all modes (triage + action + follow-up)
could show all high-priority threads. The comment in the code explains: *"Without
this, combining starCount = 0 with priorityScore >= N returns 0 results because
high-priority threads have typically been actioned (starCount > 0)."*

This logic is correct for an **explicit priority filter the user has actively
set**. But it is **wrong when applied to the default filter state**, because
the user hasn't asked for a cross-mode priority inbox — they're just looking at
Triage normally, and the default `minPriority = 50` was intended to reduce
overwhelm by showing only high-importance emails, **not** to drop the
`starCount = 0` constraint.

**Impact:** All first-time users (and any user who hasn't explicitly cleared
the minPriority filter) will see starred emails polluting their Triage view.

---

### Bug 2 — `getInboxSummary` Returns `id: null` for User-Defined Categories

**Location:** `server/src/emails/emails.service.ts` — `getInboxSummary()`;
specifically the `categoryNameToId` map construction.

**Code path:**
```ts
// getInboxSummary() builds the lookup map:
const categoryContexts = await this.userContextRepository.find({
  where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
  select: ["contextId", "contextValue"],
});
const categoryNameToId = new Map<string, string>();
for (const ctx of categoryContexts) {
  const categoryName = ctx.contextValue.split(" - ")[0].trim();  // ← name part only
  categoryNameToId.set(categoryName, ctx.contextId);
}
```

The lookup key is the **name portion before " - "** of the stored `contextValue`.

Thread categories are written to `email_threads.category` by two different
code paths that can produce **different string values**:

**Path A — LLM summarization (`summarize-email-tldr.md` prompt):**
The TLDR prompt hardcodes a fixed set of category names:
```
"category": "<one of: Newsletters, Sales & Marketing, Customer Support, …>"
```
These are generic categories — not the user's custom categories stored in
`user_contexts`. So when the summarization LLM runs before `refine-priority`
has had a chance to categorise with the user's actual category list, the thread
gets a generic category name that may not match any UserContext entry.

**Path B — Priority analysis (`prioritise-email.md` prompt, `refine-priority` job):**
The LLM is given the user's actual category names from `user_contexts` via
`emailCategoriesText`. It returns a name, and `resolveCategoryAndProtoCategory()`
stores it on the thread. The name is the `parts[0].trim()` of the contextValue,
so it should match the map. But only if the name is an **exact** case-sensitive,
whitespace-sensitive match.

**The specific failure for "Customer feedback (github issues or feedback forms)":**

This category was almost certainly created through the **proto-category
promotion path** (`proto-categories.service.ts` → `promoteToCategory()`):

```ts
// promoteToCategory() stores full description:
const categoryValue = protoCategory.description
  ? `${protoCategory.name} - ${protoCategory.description}`
  : protoCategory.name;   // ← if no description, just the name

// Then assigns to threads:
await this.emailThreadRepository.update(
  { protoCategoryId: protoCategory.id },
  {
    category: protoCategory.name,   // ← just the name
    protoCategoryId: null,
  },
);
```

However, the `contextValue` stored in `user_contexts` is `"name - description"`.
`getInboxSummary` correctly extracts `name` from `split(" - ")[0]`.

But here is the scenario that produces `null`:

**The summarization LLM categorises the email using the generic hardcoded list**
(no user context at summarisation time), writing something like `"Customer Support"`
to `email_threads.category`. Later, the `refine-priority` job re-categorises it
to `"Customer feedback (github issues or feedback forms)"`. But **if the category
name itself was created from a `context.service.ts` consolidation run**, it
could have been stored in `user_contexts.contextValue` as:

```
"Customer feedback (github issues or feedback forms) - Feedback submitted by customers through github issues or feedback forms"
```

The `categoryNameToId` map key = `"Customer feedback (github issues or feedback forms)"`.

But if the LLM (in a second consolidation or re-classification run) returns the
**full `contextValue` string** `"Customer feedback (github issues or feedback forms) - Feedback submitted…"` as the `category` field, then `email_threads.category`
stores the full string, and the map lookup fails → `id: null`.

**The second scenario (more likely):** The category was written to
`email_threads.category` by a path that stored the **full contextValue** rather
than just the name. Possible culprits:
- `context.service.ts` consolidation step at line ~2794 sets
  `value: \`${cat.name} - ${cat.description}\`` — if that value were ever written
  directly to a thread's category column (it isn't in current code, but may have
  been in a previous iteration).
- Some legacy code path that iterated `contextValue` directly without splitting.

**The safest fix:** Make `getInboxSummary` (and `getCategoryNameToIdMap` /
`runInboxQuery`) **normalize the thread category name using the same split logic**
before doing the lookup, and also store categories in `email_threads.category`
defensively, always stripping the description portion on write.

---

## Files to Change

### Server

1. **`server/src/emails/emails.service.ts`**

   **Fix Bug 1 — `runInboxQuery`:**
   The `priorityModeActive` flag should **not** drop the `starCount` filter for
   Triage mode. Priority filtering in Triage should still respect `starCount = 0`;
   only when the user navigates a "cross-mode priority view" (a future explicit
   feature) should the starCount constraint be dropped.

   Change the filter construction so that in `triage` mode, `starCount = 0` is
   **always** applied regardless of `minPriority`:

   ```ts
   // Before:
   const priorityModeActive =
     filters?.minPriority !== undefined && mode !== "blocked";

   let threadFilter = priorityModeActive
     ? 'AND thread."isArchived" = false'
     : 'AND thread."isArchived" = false AND thread."starCount" > 0';

   if (!priorityModeActive) {
     if (mode === "triage") {
       threadFilter = 'AND thread."isArchived" = false AND thread."starCount" = 0';
     }
   }

   // After:
   const priorityModeActive =
     filters?.minPriority !== undefined && mode !== "blocked";

   let threadFilter: string;
   if (mode === "triage") {
     // Triage always shows only unstarred threads, regardless of priority filter
     threadFilter = 'AND thread."isArchived" = false AND thread."starCount" = 0';
   } else if (mode === "action" || mode === "follow-up") {
     threadFilter = priorityModeActive
       ? 'AND thread."isArchived" = false'
       : 'AND thread."isArchived" = false AND thread."starCount" > 0';
   } else {
     // blocked
     threadFilter = BLOCKED_MODE_THREAD_FILTER;
   }
   ```

   Apply the same fix to **`getInboxSummary`** (identical logic duplication
   exists there starting at the `priorityModeActive` assignment in that method).

   **Fix Bug 2 — `getInboxSummary` returning `id: null`:**
   When looking up a thread's category name in the `categoryNameToId` map,
   **also attempt a lookup using only the portion before " - "** in case the
   thread was inadvertently stored with the full `contextValue`:

   ```ts
   // In the row-processing loop:
   const rawDecrypted = row.category
     ? EncryptionHelper.decrypt(row.category)
     : null;
   // Normalise: strip description suffix if present (defensive against threads
   // that stored the full contextValue "Name - Description")
   const category = rawDecrypted
     ? (rawDecrypted.split(" - ")[0].trim() || rawDecrypted)
     : "Other";
   ```

   And in `getCategoryNameToIdMap` — same pattern.

   **Fix Bug 2b — defensive write in `runInboxQuery` & thread updates:**
   In `resolveCategoryAndProtoCategory` (in `llm-processor.ts`), add a
   defensive normalisation before writing to the thread:
   ```ts
   // Strip any accidental " - description" suffix before persisting
   const safeCategory = finalCategory?.split(" - ")[0].trim() ?? null;
   ```

2. **`server/src/emails/llm-processor.ts`**

   In `resolveCategoryAndProtoCategory()`, normalise `finalCategory` before
   persisting it to `email_threads.category`. The LLM should only be returning
   the name (not the full `contextValue`), but a defensive strip prevents future
   regressions.

   Also apply this defensive normalisation in `saveSummaryResults()` where
   category is written to the thread during summarization.

3. **`server/src/proto-categories/proto-categories.service.ts`**

   In `promoteToCategory()`, when updating threads with the promoted category
   name, confirm that only `protoCategory.name` (not the contextValue) is used —
   this is already correct, but add a comment clarifying the invariant.

### Client

4. **`client/src/hooks/useInboxFilters.ts`**

   The `loadInitialFilters()` function returns `minPriority: HIGH_PRIORITY_THRESHOLD`
   (50) as the default for first-time users. This is the root trigger of Bug 1's
   impact. Two options:

   **Option A (preferred):** Change the first-visit default to `minPriority: null`
   and instead use a different UX mechanism (e.g., a one-time onboarding banner)
   to explain the priority filtering feature. This completely avoids the
   `priorityModeActive` path on first load.

   **Option B (simpler):** Keep the default at 50 but rely on the server-side
   fix (Bug 1 fix above) to correctly apply `starCount = 0` even when
   `minPriority` is set. Option B is safe after the server fix, but Option A
   removes the ambiguity entirely.

   **Recommendation: ship both** — the server fix (correct by design) plus the
   client default change (removes the footgun), with a note in the `useInboxFilters`
   comment that Triage's `starCount` filtering is enforced server-side and is not
   affected by `minPriority`.

---

## Verification Steps

After the fix is deployed:

1. **Triage with default `minPriority = 50`:** Confirm no starred emails appear
   in Triage. Check `email_threads` where `starCount > 0` — none should show.
2. **Triage with `minPriority = null`:** Same check.
3. **Triage with explicit `minPriority = 30`:** Still no starred emails.
4. **Action/Follow-up with `minPriority = 50`:** Confirm high-priority starred
   threads still appear (the cross-mode priority view should still work in
   action/follow-up).
5. **`inbox-summary` API call with `mode=triage`:** Confirm all categories return
   a non-null `id`. Specifically check "Customer feedback (github issues or
   feedback forms)" — should now return a UUID.
6. **Client accordion bucketing:** Expand the "Customer feedback" accordion — it
   should load its own emails, not a merged set from multiple categories.

---

## Migration / Data Repair

For threads already stored with a full `contextValue` as their category
(e.g., `"Customer feedback (github issues or feedback forms) - description"`),
a one-time data repair should be run:

```sql
-- Find threads where category contains " - " and doesn't match any UserContext name
-- (i.e., was stored with the full contextValue)
UPDATE email_threads
SET category = SPLIT_PART(category, ' - ', 1)
WHERE category LIKE '% - %'
  AND category NOT IN (
    SELECT SPLIT_PART(uc.context_value, ' - ', 1)
    FROM user_contexts uc
    WHERE uc.user_id = email_threads.user_id
      AND uc.context_key = 'EMAIL_CATEGORY'
  );
```

This repair should be included as a migration script, not a runtime path, since
it is a one-time fix for data already corrupted by the old code path.

---

## PR #1111 Status

PR #1111 is already **merged** (merged 2026-03-17T03:08:41Z). It addressed
localStorage cache staleness. The bugs described here are separate server-side
issues that PR #1111 did not cover.

---

## Summary of Changes

| File | Change |
|------|--------|
| `server/src/emails/emails.service.ts` | Fix `priorityModeActive` in both `runInboxQuery` and `getInboxSummary`; add defensive category name normalisation in `getInboxSummary` |
| `server/src/emails/llm-processor.ts` | Defensive strip of " - description" suffix before writing to `email_threads.category` |
| `client/src/hooks/useInboxFilters.ts` | Change first-visit default from `minPriority: 50` to `minPriority: null` |
| `server/src/db/migrations/` | One-time repair: strip " - description" from existing thread categories that contain it |

