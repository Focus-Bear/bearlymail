# Plan: Typeahead filter for Change Category modal + categoryId migration fix

## Overview

Two related changes to `CategoryOverrideModal`:

1. **Typeahead filter** — replace the native `<select>` with a filterable combobox
2. **Bug fix** — send `categoryId` (UUID) instead of `category` (name string) in the override API call

Both touch the same component and share the same root cause: the modal currently works with category **names** (`string[]`) but should work with category **objects** (`{ id: string; name: string }`).

---

## Part 1: Bug — category-override sends name instead of UUID

### Problem

`CategoryOverrideModal` (line 140) sends:

```ts
await axios.post(`${API_URL}/emails/${emailId}/category-override`, {
  category: resolvedCategory, // ← name string like "📚 PhD research"
  reason: reasonText.trim() || undefined,
});
```

The backend `overrideCategory` in `email-archive.service.ts` (line 242) accepts `newCategory: string` (a name), then does a **reverse lookup** (line 275–285) to find the UUID via `user_contexts`. This is fragile — if the name has trailing spaces, emoji differences, or case mismatches, the lookup fails silently and sets `categoryId=null` with only a `logger.warn`.

### Root cause

The `GET /emails/categories` endpoint (deprecated, see controller line 136–141) returns `string[]` — just names, no IDs. The modal has no access to UUIDs.

### Data flow (current)

```
Client: GET /emails/categories → string[] (names only)
Client: POST category-override { category: "📚 PhD research" }
Server: reverse-lookup name→UUID in user_contexts → fragile match
Server: UPDATE email_threads SET categoryId = <resolved UUID or null>
```

### Data flow (proposed)

```
Client: GET /emails/inbox-summary?mode=triage&includeThreadIds=false → { categories: [{ id, name, count }] }
Client: POST category-override { categoryId: "<uuid>", reason: "..." }
Server: use categoryId directly — no reverse lookup needed
```

### Changes

#### Client: `client/src/components/priority/CategoryOverrideModal.tsx`

**Current state (line 98–109):** Fetches `GET /emails/categories` → `string[]`

**Change to:** Fetch from `GET /emails/inbox-summary?mode=triage&includeThreadIds=false`, extract `categories` array which has `{ id: string | null; name: string; count: number }[]`.

```ts
// Replace the type
interface CategoryOption {
  id: string | null;
  name: string;
}

// In the useEffect (line 98–109), change:
// FROM:
axios.get<string[]>(`${API_URL}/emails/categories`);
// TO:
axios.get<{ categories: { id: string | null; name: string; count: number }[] }>(
  `${API_URL}/emails/inbox-summary?mode=triage&includeThreadIds=false`,
);
// Then map to CategoryOption[], filtering out currentCategory by name
```

**State changes:**

- `existingCategories` type: `string[]` → `CategoryOption[]`
- `selectedCategory` type: `string` → `string` (stores the **id** now, not the name)

**Submit handler (line 136–145):** Change payload:

```ts
// FROM:
{ category: resolvedCategory, reason: ... }
// TO:
{ categoryId: resolvedCategoryId, categoryName: resolvedCategoryName, reason: ... }
// Send both: categoryId for the DB update, categoryName for the custom-category case and audit log
```

#### Server: `server/src/emails/emails.controller.ts` (line 593–604)

**Change the body type:**

```ts
// FROM:
@Body() body: { category: string; reason?: string }
// TO:
@Body() body: { categoryId?: string; categoryName?: string; category?: string; reason?: string }
// Accept both old and new format for backward compatibility during rollout
```

Pass through to service: prefer `categoryId` if present, fall back to `category` name lookup.

#### Server: `server/src/emails/email-archive.service.ts` (line 242–315)

**Add `categoryId` parameter path:**

```ts
async overrideCategory(
  userId: string,
  emailId: string,
  newCategory: string,       // keep for backward compat + audit log
  reasonText?: string,
  categoryId?: string,       // NEW: direct UUID, skip reverse lookup
): Promise<{ success: boolean; category: string }>
```

When `categoryId` is provided:

- Skip the name→UUID reverse lookup (lines 275–285)
- Use `categoryId` directly for the `emailThreadRepository.update`
- Still store `newCategory` (name) in `category_overrides.userCategory` for the audit trail

When `categoryId` is NOT provided (backward compat):

- Existing name→UUID lookup logic remains unchanged

#### Server: `server/src/emails/emails.service.ts` (line 489–500)

Thread through the new `categoryId` parameter.

#### Cleanup: `GET /emails/categories` endpoint

After this change, the endpoint at controller line 136–141 is fully unused. Add a `@Deprecated()` JSDoc or remove it entirely.

---

## Part 2: Typeahead filter for category selection

### Current rendering

`CategorySelectField` (lines 11–59) renders a native `<select>` with `<option>` elements. No filtering, no keyboard navigation beyond browser-native select behavior.

### Existing pattern to reuse

`client/src/components/quick-actions/modals/github/ProjectStatusSelector.tsx` (312 lines) implements a full combobox with:

- Text input for filtering
- Filtered dropdown list with `role="listbox"` / `role="option"`
- Keyboard navigation (ArrowUp/Down, Enter, Escape)
- `role="combobox"` + `aria-controls` + `aria-activedescendant`
- Highlighted index tracking
- Click-outside-to-close

Also: `client/src/components/common/TimezoneAutocomplete.tsx` implements a similar pattern with `toLowerCase().includes()` filtering.

### Approach

**Replace `CategorySelectField` with a new `CategoryCombobox` component** that follows the `ProjectStatusSelector` pattern but simplified for string-named categories.

### New component: `CategorySelectField` refactor (same file, inline)

Replace the native `<select>` in `CategorySelectField` (lines 37–56) with:

```tsx
// State additions in CategorySelectField:
const [searchTerm, setSearchTerm] = useState("");
const [isOpen, setIsOpen] = useState(false);
const [highlightedIndex, setHighlightedIndex] = useState(0);

// Filtering:
const filtered = existingCategories.filter((cat) =>
  cat.name.toLowerCase().includes(searchTerm.toLowerCase()),
);

// Render:
// 1. Text input (replaces <select>) with:
//    - role="combobox"
//    - aria-expanded={isOpen}
//    - aria-controls="category-listbox"
//    - placeholder from t('priority.categoryOverride.selectPlaceholder')
//    - onChange → setSearchTerm + open dropdown
//    - onKeyDown → ArrowUp/Down/Enter/Escape handlers
//    - onFocus → open dropdown
//
// 2. Dropdown div (role="listbox", id="category-listbox"):
//    - Filtered category items (role="option")
//    - Each shows category name, click to select
//    - Highlighted item via highlightedIndex
//    - Empty state: t('priority.categoryOverride.noMatch') → "No categories match"
//    - Always show "+ Add new category" at bottom (role="option")
//
// 3. When item selected:
//    - setSearchTerm(cat.name) — show selected name in input
//    - onSelectChange(cat.id) — pass the UUID up
//    - close dropdown
//
// 4. Click outside → close dropdown (useRef + useEffect, same as TimezoneAutocomplete)
```

### Props changes to `CategorySelectField`

```ts
// FROM:
existingCategories: string[];
selectedCategory: string;         // was name
onSelectChange: (v: string) => void;

// TO:
existingCategories: CategoryOption[];   // { id, name }
selectedCategory: string;               // now stores ID
onSelectChange: (id: string) => void;   // passes ID
```

### i18n additions

Add to `client/src/locales/en.json` under `priority.categoryOverride`:

```json
"filterPlaceholder": "Type to filter categories...",
"noMatch": "No categories match"
```

**Lines to add after line 2132** (after `"selectPlaceholder"`).

### Styling

Match the existing `selectStyle` dimensions and colors. The dropdown should:

- Appear below the input
- Have `maxHeight: 200px` with `overflowY: 'auto'`
- Use `position: absolute` + `zIndex: 10002` (modal is 10001)
- Match `theme.colors.background.paper` background
- Highlighted item: `theme.colors.background.hover` or similar
- Border: `1px solid ${theme.colors.border.medium}`

---

## File change summary

| File                                                       | Lines                                                         | Change                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `client/src/components/priority/CategoryOverrideModal.tsx` | 11–59 (CategorySelectField), 82–109 (fetch), 136–145 (submit) | Major: new combobox UI, fetch from inbox-summary, send categoryId |
| `client/src/locales/en.json`                               | ~2132                                                         | Add `filterPlaceholder`, `noMatch` keys                           |
| `server/src/emails/emails.controller.ts`                   | 593–604                                                       | Accept `categoryId` in body                                       |
| `server/src/emails/emails.service.ts`                      | 489–500                                                       | Thread `categoryId` param                                         |
| `server/src/emails/email-archive.service.ts`               | 242–315                                                       | Add `categoryId` fast path, keep name fallback                    |

## Test plan

1. **Unit tests:** `CategoryOverrideModal` renders combobox, filters on typing, shows empty state, selects via click and keyboard
2. **Unit tests:** `overrideCategory` service — test both `categoryId` (direct) and `category` (name fallback) paths
3. **Integration:** Open Change Category modal → type partial name → list filters → select → verify POST sends `categoryId` UUID
4. **Regression:** "+ Add new category" flow still works (custom name, no UUID)
5. **Backward compat:** Old clients sending `{ category: "name" }` still work

## Risks

- **Low:** inbox-summary endpoint returns categories with counts — we ignore counts, just use id+name. If inbox-summary is slow, modal load could feel sluggish (mitigate: the endpoint is already called by the inbox filter bar, so it's likely cached/fast).
- **Low:** Custom "Add new category" still sends a name string (no UUID exists yet). Backend name→UUID lookup remains for this path only.

---

_Plan by Monk of Modularity 🧘_
