# Plan: Fix Category Dropdown in CategoryOverrideModal (Issue #659)

## Problem Summary

The "Change Category" popup (`CategoryOverrideModal`) only displays categories from emails
currently loaded in the Redux store — typically the small subset visible in the inbox
at open time. A user with 35 categories may see only 2.

---

## Root Cause

**File:** `client/src/components/priority/CategoryOverrideModal.tsx`

```ts
// BROKEN — reads from Redux store (only currently-loaded emails)
const emails = useSelector(selectEmails);

const existingCategories = useMemo(() => {
  const categories = new Set<string>();
  emails.forEach((email) => {
    if (
      email.category &&
      email.category !== currentCategory &&
      email.category !== ADD_NEW_VALUE
    ) {
      categories.add(email.category);
    }
  });
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}, [emails, currentCategory]);
```

`selectEmails` returns only the emails currently held in the Redux slice (the visible
inbox page / current filter). If a user is in a filtered view or the inbox is paginated,
the derived `existingCategories` list is a tiny subset of their real category list.

---

## Existing Solution: `GET /emails/categories`

The backend already exposes a purpose-built endpoint:

**`server/src/emails/emails.controller.ts` line 134:**

```ts
@Get("categories")
async getCategories(@Request() req) {
  // Return list of unique categories for filtering
  return this.emailsService.getCategories(req.user.userId);
}
```

**`server/src/emails/emails.service.ts` line 243:**

```ts
async getCategories(userId: string): Promise<string[]> {
  const categories = await this.emailThreadRepository.query(
    `SELECT DISTINCT category FROM email_threads WHERE "userId" = $1 AND category IS NOT NULL`,
    [userId],
  );
  // … decrypt, deduplicate (AES-GCM random IVs), sort, return string[]
}
```

This returns **all** unique categories across the user's entire mailbox — exactly what
the dropdown needs.

The same endpoint is already consumed correctly by `useInboxFilters.ts` (line 85):

```ts
const response = await axios.get<string[]>(`${API_URL}/emails/categories`);
```

---

## Proposed Fix

Replace the `useMemo` + Redux selector pattern with a `useEffect` that fetches from
`GET /emails/categories` on mount.

### Before

```ts
import { useSelector } from "react-redux";
import { selectEmails } from "store/selectors/emailSelectors";

const emails = useSelector(selectEmails);

const existingCategories = useMemo(() => {
  const categories = new Set<string>();
  emails.forEach((email) => {
    if (
      email.category &&
      email.category !== currentCategory &&
      email.category !== ADD_NEW_VALUE
    ) {
      categories.add(email.category);
    }
  });
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}, [emails, currentCategory]);
```

### After

```ts
import { useState, useEffect } from "react";
// Remove: import { useSelector } from 'react-redux';
// Remove: import { selectEmails } from 'store/selectors/emailSelectors';

const [existingCategories, setExistingCategories] = useState<string[]>([]);
const [loadingCategories, setLoadingCategories] = useState(false);

useEffect(() => {
  let cancelled = false;
  setLoadingCategories(true);
  axios
    .get<string[]>(`${API_URL}/emails/categories`)
    .then((res) => {
      if (!cancelled) {
        // Exclude the current category so "move to same category" isn't offered
        setExistingCategories(
          res.data.filter((cat) => cat !== currentCategory),
        );
      }
    })
    .catch((err) => {
      console.error("Failed to load categories:", err);
    })
    .finally(() => {
      if (!cancelled) setLoadingCategories(false);
    });
  return () => {
    cancelled = true;
  };
}, [currentCategory]);
```

> **Cleanup flag (`cancelled`):** prevents a stale setState if the modal unmounts
> before the request resolves (React best practice).

### UX: Loading state

While the API call is in-flight, the `<select>` should communicate loading:

```tsx
<select
  value={isAddingNew ? ADD_NEW_VALUE : selectedCategory}
  onChange={(e) => handleSelectChange(e.target.value)}
  disabled={loadingCategories}
  style={selectStyle}
>
  <option value="" disabled>
    {loadingCategories
      ? t("priority.categoryOverride.loadingCategories") // new i18n key
      : t("priority.categoryOverride.selectPlaceholder")}
  </option>
  {existingCategories.map((cat) => (
    <option key={cat} value={cat}>
      {cat}
    </option>
  ))}
  <option value={ADD_NEW_VALUE}>
    {t("priority.categoryOverride.addNewCategory")}
  </option>
</select>
```

**i18n key to add** (e.g. `en.json`):

```json
"loadingCategories": "Loading categories…"
```

---

## Files Changed

| File                                                       | Change                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `client/src/components/priority/CategoryOverrideModal.tsx` | Replace Redux `useMemo` with `useEffect` + API fetch; add `loadingCategories` state; disable select while loading |
| `client/src/locales/en/translation.json` (or equivalent)   | Add `priority.categoryOverride.loadingCategories` i18n key                                                        |

### Files **not** changed

- `server/` — no backend changes needed; endpoint already exists and works correctly
- `store/` — Redux store untouched; `selectEmails` still used by other consumers

---

## Edge Cases

| Scenario                                               | Behaviour                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| API returns empty list                                 | Select shows only "Add new category" — still functional                          |
| API error                                              | `console.error`, categories list stays empty, user can still type a new category |
| Modal unmounts before fetch completes                  | Cleanup flag prevents setState on unmounted component                            |
| `currentCategory` changes (shouldn't happen mid-modal) | `useEffect` re-runs, list refreshes                                              |
| User has no categories yet                             | Returns `[]`, only "Add new" option shown                                        |

---

## Testing

1. Seed account with >10 categories spread across emails not all loaded at once.
2. Open inbox in a filtered view (e.g. filter to one category — loads minimal emails).
3. Click any email → "Change Category".
4. **Before fix:** dropdown shows only 1–2 categories.
5. **After fix:** dropdown shows all categories.

### Regression test (e2e — pairs with #656 plan)

Add to `e2e/tests/regression.spec.ts`:

```ts
test("category dropdown shows all categories, not just loaded emails", async ({
  page,
}) => {
  // login, navigate to inbox
  // open any email → change category modal
  // assert dropdown has > 1 option (beyond "Add new")
  const options = page.locator(
    'select option:not([disabled]):not([value="__add_new__"])',
  );
  await expect(options).toHaveCount.greaterThan(0);
  // No JS errors should appear
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(errors).toHaveLength(0);
});
```

---

## Implementation Steps

1. **Branch:** `fix/issue-659-category-dropdown` ✅ (this branch)
2. Edit `CategoryOverrideModal.tsx`:
   - Remove `useSelector` / `selectEmails` imports
   - Remove `useMemo` block
   - Add `useState` + `useEffect` for API fetch
   - Add `loadingCategories` state + disabled prop on `<select>`
3. Add i18n key for loading state
4. Manual test with QA user (`internaltest+openclaw_qa@focusbear.io`)
5. Open PR, request review

---

🧘 This PR was created by Monk of Modularity (AI Agent).
