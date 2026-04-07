# Plan: Show category rules inline & icon buttons — Issue #1624

## Problem

When a user has already created deterministic category rules for a category, the Email Categories context section still shows an "Add matching rule" button per category item. Jeremy's feedback:

1. Should show **"{n} rules"** instead of "Add matching rule" when rules already exist
2. Clicking "{n} rules" should **expand an accordion** showing the rules for that category
3. Edit and delete buttons on context items should be **icons** instead of text

## Current Architecture

### Where "Add matching rule" is rendered
- **`client/src/components/settings/guide-ai/ContextSection.tsx`** → `ContextItem` component (lines ~270-310)
- The button appears for every `EMAIL_CATEGORY` context item when `CategoryRuleFromCategoryContext` is available
- It calls `categoryRuleFromCategory.openAddRuleForCategoryDisplayName(categoryDisplayNameForRule)` to open the composite rule modal

### How categories map to rules
- `getEmailCategoryDisplayNameFromContextValue(contextValue)` extracts the category display name from the context value (e.g., `"Newsletters"` from `"Newsletters - Regular subscription emails"`)
- Category rules (`CategoryRuleDto`) have a `categoryName` field that matches this display name
- Rules are fetched via `useCategoryRules()` hook → `GET /api/category-rules`

### Where rules are currently managed
- **`DeterministicCategoryRulesSection`** — standalone section in GuideOurAI that lists all rules
- **`DeterministicCategoryRuleRow`** — renders individual rule details (sender, subject, body patterns)
- **`useDeterministicCategoryRulesSectionState`** — manages modal state, CRUD operations

### Icon library
- Project uses **`react-icons/fi`** (Feather Icons) throughout — e.g., `FiEdit2`, `FiMoreVertical`, `FiTrash2`

## Implementation Plan

### 1. Pass category rules into `ContextItem` for EMAIL_CATEGORY items

**File:** `client/src/contexts/CategoryRuleFromCategoryContext.tsx`

Extend the context value type to also expose the rules array:

```ts
export type CategoryRuleFromCategoryContextValue = {
  openAddRuleForCategoryDisplayName: (displayName: string) => void;
  rules: CategoryRuleDto[];  // <-- ADD
};
```

**File:** `client/src/components/settings/GuideOurAISection.tsx`

Update the provider value to include `deterministicCategoryRulesController.rules`:

```tsx
<CategoryRuleFromCategoryContext.Provider
  value={{
    openAddRuleForCategoryDisplayName: deterministicCategoryRulesController.openAddWithPrefill,
    rules: deterministicCategoryRulesController.rules,  // <-- ADD
  }}
>
```

### 2. Show "{n} rules" vs "Add matching rule" in `ContextItem`

**File:** `client/src/components/settings/guide-ai/ContextSection.tsx`

In the `ContextItem` component, replace the current "Add matching rule" button logic:

```tsx
// Inside ContextItem, after getting categoryDisplayNameForRule:
const matchingRules = (categoryRuleFromCategory?.rules ?? [])
  .filter(r => r.categoryName === categoryDisplayNameForRule);
const ruleCount = matchingRules.length;
```

Replace the existing `showAddMatchingRuleButton && (...)` block:

- **If `ruleCount > 0`**: render a button showing `"{ruleCount} rules"` (use i18n key `settings.emailCategories.rulesCount` with `count` param). Clicking toggles a local `showRulesAccordion` state.
- **If `ruleCount === 0`**: render the existing "Add matching rule" button (unchanged behavior).

### 3. Add inline accordion for category rules

**File:** `client/src/components/settings/guide-ai/ContextSection.tsx`

Add a new state to `ContextItem`:
```tsx
const [showRulesAccordion, setShowRulesAccordion] = useState(false);
```

Below the existing `ContextItem` div, when `showRulesAccordion` is true, render a collapsible panel listing the matching rules. Reuse the rendering logic from `DeterministicCategoryRuleRow` (import it) but in a compact read-only style:

```tsx
{showRulesAccordion && matchingRules.length > 0 && (
  <div style={{
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.lg,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.colors.border.light}`,
  }}>
    {matchingRules.map(rule => (
      <DeterministicCategoryRuleRow
        key={rule.id}
        rule={rule}
        onToggleEnabled={/* from context or pass through */}
        onDelete={/* from context or pass through */}
        onEditComposite={/* from context or pass through */}
      />
    ))}
  </div>
)}
```

**Important:** To support edit/delete/toggle from the accordion, extend `CategoryRuleFromCategoryContextValue` to expose these callbacks too:

```ts
export type CategoryRuleFromCategoryContextValue = {
  openAddRuleForCategoryDisplayName: (displayName: string) => void;
  rules: CategoryRuleDto[];
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDeleteRule: (id: string) => void;
  onEditRule: (rule: CategoryRuleDto) => void;
};
```

Wire these from `deterministicCategoryRulesController` in `GuideOurAISection.tsx`:
```tsx
value={{
  openAddRuleForCategoryDisplayName: deterministicCategoryRulesController.openAddWithPrefill,
  rules: deterministicCategoryRulesController.rules,
  onToggleEnabled: deterministicCategoryRulesController.handleToggle,
  onDeleteRule: deterministicCategoryRulesController.handleDelete,
  onEditRule: deterministicCategoryRulesController.openEdit,
}}
```

### 4. Replace Edit/Delete text buttons with icons

**File:** `client/src/components/settings/guide-ai/ContextSection.tsx`

In the `ContextItem` component, replace the Edit and Delete text buttons with icon buttons:

```tsx
import { FiEdit2, FiTrash2 } from 'react-icons/fi';

// Replace:
//   {t('common.edit')}
// With:
//   <FiEdit2 size={14} />

// Replace:
//   {t('common.delete')}
// With:
//   <FiTrash2 size={14} />
```

Keep the existing `onClick` handlers, `style` for cursor/color, and add `title` attributes for accessibility:
```tsx
<button title={t('common.edit')} aria-label={t('common.edit')} ...>
  <FiEdit2 size={14} />
</button>
<button title={t('common.delete')} aria-label={t('common.delete')} ...>
  <FiTrash2 size={14} />
</button>
```

### 5. Add i18n keys

**Files:** `client/src/locales/en.json`, `client/src/locales/es.json`

Add under `settings.emailCategories`:
```json
"rulesCount": "{{count}} rule",
"rulesCount_plural": "{{count}} rules"
```

(Or use the `_one`/`_other` suffix depending on which i18n pluralisation the project uses — check existing patterns.)

### 6. Keep "Add matching rule" available within the accordion

When `ruleCount > 0` and the accordion is expanded, add a small "+ Add rule" link at the bottom of the accordion that calls the existing `openAddRuleForCategoryDisplayName` function. This preserves the ability to add more rules to a category that already has some.

## Files Changed (Summary)

| File | Change |
|------|--------|
| `client/src/contexts/CategoryRuleFromCategoryContext.tsx` | Extend context type with `rules`, `onToggleEnabled`, `onDeleteRule`, `onEditRule` |
| `client/src/components/settings/GuideOurAISection.tsx` | Pass additional controller methods to context provider |
| `client/src/components/settings/guide-ai/ContextSection.tsx` | Main changes: conditional "{n} rules" button, accordion, icon buttons |
| `client/src/locales/en.json` | Add `rulesCount` i18n key |
| `client/src/locales/es.json` | Add `rulesCount` i18n key (Spanish) |

## Testing

- Verify that a category with 0 rules shows "Add matching rule" (existing behavior)
- Verify that a category with 1+ rules shows "{n} rules" (singular/plural)
- Verify clicking "{n} rules" expands the accordion showing rule details
- Verify edit/delete/toggle within the accordion work correctly
- Verify the "+ Add rule" link inside accordion opens the composite rule form with correct prefill
- Verify edit and delete buttons on ALL context items (not just EMAIL_CATEGORY) are now icons with tooltips
- Verify the icons have proper `title`/`aria-label` for accessibility
- Verify the DeterministicCategoryRulesSection (standalone) still works as before

## Edge Cases

- Category display name extraction: ensure `getEmailCategoryDisplayNameFromContextValue` handles edge cases (empty strings, no dash separator)
- Rules loading state: while rules are loading, show "Add matching rule" as fallback (don't flash "0 rules")
- Category name case sensitivity: verify `categoryName` matching is case-insensitive or normalised consistently
