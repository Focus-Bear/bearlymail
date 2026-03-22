# Plan: Fix "Other" category showing count 0 in inbox UI

**Issue:** #1294
**Author:** Monk of Modularity (OpenClaw)

## Problem

The "Other" category in the inbox UI displays a count of 0 even though the API
returns the correct count (e.g. 3 emails). Users see the accordion header with
"Other (0)" but the server `/emails/inbox-summary` response correctly reports
`{ id: null, name: "Other", count: 3 }`.

## Root Cause

There is a **category key mismatch** between the summary-driven display path and
the email-grouping path.

### Server side
`email-inbox.service.ts` → `countRowsByCategory()` assigns category name
`"Other"` for threads with no category. Because "Other" has no real UUID,
`categoryUuidByName` never gets an entry for it, so the summary returns:
```json
{ "id": null, "name": "Other", "count": 3 }
```

### Client side — summary key
`getCategoryKey(id, name)` in `useEmailFetching.ts` resolves `getCategoryKey(null, "Other")` → **`"uncategorized"`**.

### Client side — email grouping key
`groupEmailsByCategory()` in `CategoryAccordion.tsx` groups emails using:
```ts
const categoryKey = email.category_id ?? email.category ?? CATEGORY_OTHER;
```
For "Other" emails, `category_id` is typically `null` and `category` is
`"Other"`, so the group key is **`"Other"`** (the string).

### The mismatch
`CategorySection` looks up emails via:
```ts
const categoryKey = getCategoryKey(categoryItem.id, categoryName); // → "uncategorized"
const group = emailCategoryMap.get(categoryKey);                   // → undefined (map has key "Other")
const categoryEmails = group?.emails ?? [];                        // → []
```
Then the accordion renders:
```ts
count={isLoaded ? categoryEmails.length : categoryItem.count}
//  → isLoaded=true, categoryEmails.length=0  →  shows 0
```

The summary says 3, but after loading, the loaded-emails lookup finds 0 because
the map key is `"Other"` while the lookup key is `"uncategorized"`.

## Fix

### Option A (recommended): Align `groupEmailsByCategory` to use UUID keys

In `CategoryAccordion.tsx` → `groupEmailsByCategory()`, change the category key
computation to use the same logic as `getCategoryKey`:

```ts
// Before
const categoryKey = email.category_id ?? email.category ?? CATEGORY_OTHER;

// After
import { getCategoryKey } from 'hooks/useEmailFetching';
const categoryKey = getCategoryKey(email.category_id, email.category ?? CATEGORY_OTHER);
```

This ensures that when `category_id` is `null`, the key becomes
`"uncategorized"` — matching the summary lookup key.

### Ripple effects
- `buildEmailCategoryMap()` and `buildOtherProtoGroups()` in
  `inboxCategoryHelpers.ts` consume the map returned by
  `groupEmailsByCategory`. `buildOtherProtoGroups` currently does
  `emailCategoryMap.get(CATEGORY_OTHER)` — this must change to
  `emailCategoryMap.get("uncategorized")` (import `CATEGORY_KEY_UNCATEGORIZED`
  from `inboxDataSlice`).
- Verify `CategorySection.tsx` — the `isOtherCategory` check uses
  `categoryName === CATEGORY_OTHER` which is a display-name check and remains
  correct.

### Option B (alternative): Make `getCategoryKey` return `"Other"` for null ids

This is simpler but breaks the established invariant that keys are always UUIDs
or the constant `"uncategorized"`. Not recommended.

## Files to Change

| File | Change |
|------|--------|
| `client/src/components/inbox/CategoryAccordion.tsx` | `groupEmailsByCategory`: use `getCategoryKey(email.category_id)` instead of raw fallback |
| `client/src/components/inbox/inboxCategoryHelpers.ts` | `buildOtherProtoGroups`: look up `CATEGORY_KEY_UNCATEGORIZED` instead of `CATEGORY_OTHER` |
| `client/src/components/inbox/inboxCategoryHelpers.test.ts` | Update test expectations for the new key |

## Testing

1. Ensure a user has emails in the "Other" category (no assigned category UUID).
2. Load inbox — verify the "Other" accordion shows the correct count.
3. Expand "Other" — verify emails render.
4. Verify all named categories still render correctly.
5. Verify proto-category sub-accordions inside "Other" still group properly.

## Risk Assessment

- **Low risk.** The change aligns two code paths that should already agree on a
  key format. No server changes needed.
- The phishing-category override path already sets `CATEGORY_DANGEROUS_PHISHING`
  directly and is unaffected.
