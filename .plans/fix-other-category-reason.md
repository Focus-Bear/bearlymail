# Plan: fix Other category reason/explanation not showing after category migration

## Bug Summary
After the category→categoryId migration (PR #1330, commit `2117306d`), emails in
the "Other" category no longer display the reason/explanation for why they ended
up there. The category name also renders as blank in the priority tooltip.

## Root Cause

The migration removed the denormalized `category` string column from
`email_threads`. The server now derives `email.category` from a
`LEFT JOIN user_contexts uc ON uc."contextId" = thread."categoryId"` in
`runInboxQuery` (email-inbox.service.ts:544). For "Other" emails (where
`categoryId` is `NULL`), this JOIN returns `NULL` for `uc."contextValue"`, so
`decryptRawEmailRow` sets `category: null` instead of `category: "Other"`.

### Affected Components

Two client components check `email.category === 'Other'` without handling null:

1. **`PriorityTooltipCategory.tsx:120`**
   ```ts
   const isOtherCategory = category === CATEGORY_OTHER;
   // category is null → null === 'Other' → false
   ```
   - Category name renders as blank (React renders `null` as empty string)
   - Proto-category subsection doesn't appear for Other emails
   - The ℹ️ explanation toggle still appears if `categoryExplanation` is truthy,
     but the UX is broken because the category heading is empty

2. **`PriorityBadge.tsx:87`**
   ```ts
   category={email.category}
   // Passes null; tooltip renders blank category heading
   ```

**Already fixed correctly** in the same migration PR:
- `EmailPreview.tsx:17`: Uses `!email.category_id || email.category === CATEGORY_OTHER`

### Why the inline 💡 explanation might still appear

`EmailPreview` (the inline preview text) checks `!email.category_id`, which
correctly handles null. So the `💡 {email.categoryExplanation}` text below the
email summary may still render. The reported regression is specifically about the
**priority tooltip** category section, which is the primary place users see the
explanation (via the ℹ️ toggle).

## Minimal Fix

### Option A: Server-side (preferred — single fix point)

In `decryptRawEmailRow` (email-inbox.service.ts ~line 730):

```ts
// Before:
category: row.categoryName
    ? (EncryptionHelper.decrypt(row.categoryName)?.split(" - ")[0].trim() ?? null)
    : null,

// After:
category: row.categoryName
    ? (EncryptionHelper.decrypt(row.categoryName)?.split(" - ")[0].trim() ?? OTHER_CATEGORY_NAME)
    : OTHER_CATEGORY_NAME,
```

This ensures `email.category` is always `"Other"` (never null) for uncategorized
emails. All downstream client components that check `=== 'Other'` will work
without modification.

**Note:** This constant `OTHER_CATEGORY_NAME` is already defined at the top of
the file.

### Also fix (defense-in-depth): Client-side

Even with the server fix, harden the client checks for robustness:

**`PriorityTooltipCategory.tsx:120`:**
```ts
// Before:
const isOtherCategory = category === CATEGORY_OTHER;
// After:
const isOtherCategory = !category || category === CATEGORY_OTHER;
```

**`PriorityBadge.tsx:87`:**
```ts
// Before:
category={email.category}
// After:
category={email.category ?? (email.category_id ? undefined : CATEGORY_OTHER)}
```

### Files to modify (3 files)

| File | Change | Risk |
|------|--------|------|
| `server/src/emails/email-inbox.service.ts` | `decryptRawEmailRow`: return `OTHER_CATEGORY_NAME` instead of `null` when categoryName is absent | Low — semantic no-op; callers already treat null category as "Other" |
| `client/src/components/priority/tooltip/PriorityTooltipCategory.tsx` | `isOtherCategory` check: add `!category` | Low — defensive; only affects display logic |
| `client/src/components/inbox/header/PriorityBadge.tsx` | Resolve null category to "Other" when passing prop | Low — defensive; only affects display |

### Tests to update

- `PriorityTooltipCategory` tests (if any): add case for `category={null}` 
- `email-inbox.service.ts` unit tests: verify `decryptRawEmailRow` returns "Other" for null categoryName

## Risk Assessment

**Low risk.** All changes are display-layer only. The `categoryExplanation` data
is correctly stored, selected, decrypted, and returned by the API — the only
issue is how the client interprets `null` category for "Other" detection.

---

Created by Monk of Modularity (AI agent) via OpenClaw
