# Plan: Implement Visual Filters (#1414)

## Problem Statement

The current inbox filters use traditional dropdown selectors (multi-select for accounts/categories, single-select for priority ranges). Jeremy describes them as "boring and hard to understand." The goal is to replace them with a visual, intuitive filter experience based on the design reference at [Magic Patterns — Priority Range Selector Design](https://www.magicpatterns.com/c/ah6gyw8agwfmzttjtsduhr/preview).

---

## Current Filter Architecture

### Files & Components

| File | Role |
|------|------|
| `client/src/components/inbox/InboxFilters.tsx` | Main filter bar component (~490 lines). Contains `MultiSelectDropdown`, `SingleSelectDropdown`, and the top-level `InboxFilters` component |
| `client/src/hooks/useInboxFilters.ts` | Filter state hook (~180 lines). Manages `InboxFilter` state, localStorage persistence, priority constants (`PRIORITY_RANGES`), connected accounts query, category fetching |
| `client/src/components/inbox/inboxFilters.helpers.ts` | Pure helper: `getMultiSelectDisplayText()` |
| `client/src/components/inbox/inboxFilters.helpers.test.ts` | Unit tests for helpers |
| `client/src/hooks/useInboxFilters.test.ts` | Unit tests for the hook (priority migration, localStorage, etc.) |
| `client/src/contexts/InboxContext.tsx` | Defines `InboxFiltersValue` context type; exposes `useInboxFiltersCtx()` |
| `client/src/contexts/InboxProvider.tsx` | Instantiates `useInboxFilters()` as single source of truth; provides via `InboxFiltersContext.Provider` |
| `client/src/pages/Inbox.tsx` | Renders `<InboxFilters>` in the main inbox layout (line ~199) |
| `client/src/components/inbox/InboxHeader.tsx` | Contains `FilterToggleButton` (filter icon + badge count) |

### Current Filter Types

1. **Account Filter** — Multi-select dropdown of connected email accounts (Gmail/Office365/Zoho). Hidden when only 1 account.
2. **Category Filter** — Multi-select dropdown with search. Categories fetched from `/emails/inbox-summary`. Uses UUID-based IDs.
3. **Priority Filter** — Single-select dropdown with predefined ranges:
   - All (null, null)
   - Very Low (null, 0) — `< 0`
   - Low (0, 15) — `0-15`
   - Medium (15, 30) — `15-30`
   - High (30, 50) — `30-50`
   - Very High (50, null) — `> 50`

### State Management

- **State lives in:** `useInboxFilters()` hook → provided via `InboxFiltersContext`
- **Persistence:** `localStorage` key `inbox_filters`
- **Filter shape:** `InboxFilter { accountIds: string[], categories: string[], minPriority: number | null, maxPriority: number | null }`
- **Default:** New users start with `minPriority: 50, maxPriority: null` (Very High only)
- **API integration:** `onFilterChange` callback triggers `fetchEmails()` with filter overrides

### Current UI Pattern

The filter bar is a horizontal strip below the inbox header, toggled via a filter icon button. It uses inline styles throughout (no CSS modules/Tailwind). Dropdowns are custom-built (not using a component library).

---

## Design Reference Analysis

**Source:** [Priority Range Selector Design — Magic Patterns](https://www.magicpatterns.com/c/ah6gyw8agwfmzttjtsduhr/preview)

The design reference is titled "Priority Range Selector Design" — a React component built on Magic Patterns. Based on the title and the issue context ("visual filters" to replace "boring dropdowns"), the new design uses:

### Visual Approach (inferred from title + UX best practices)

1. **Visual pill/chip toggles** instead of dropdown menus — clickable, color-coded segments representing each priority tier
2. **Range visualization** — likely a horizontal bar or segmented control where each priority range is a visually distinct, clickable region
3. **Color coding** — each priority tier (Very Low → Very High) gets a distinct color, making the meaning immediately obvious
4. **Active state highlighting** — selected range(s) are visually prominent; unselected ranges are dimmed
5. **Possibly interactive slider handles** — allowing users to drag to set custom min/max ranges

### Key UX Improvements Over Current

- **Glanceable:** Users can instantly see what priority level they're filtering to
- **Spatial mapping:** Priority goes from low (left) to high (right) — natural mental model
- **Fewer clicks:** Toggle a priority tier with one click instead of open dropdown → scan → select
- **Multi-select friendly:** Could support selecting multiple adjacent/non-adjacent tiers

> **Note:** The Magic Patterns preview is JS-rendered and couldn't be fully extracted. Codebeard should open the URL in a browser to capture the exact design before implementing. If the design is inaccessible, implement a segmented control / pill-toggle pattern based on the description above.

---

## Implementation Plan

### Phase 1: Create `VisualPriorityFilter` Component

**New file:** `client/src/components/inbox/VisualPriorityFilter.tsx`

A self-contained component that replaces the `SingleSelectDropdown` for priority filtering:

- Horizontal segmented control with 6 segments (matching `PRIORITY_RANGES`)
- Each segment is a clickable pill/button with:
  - Priority tier label (Very Low, Low, Medium, High, Very High)
  - Score range display (e.g., "0-15")
  - Distinct background color per tier (gradient from cool to warm)
  - Active/selected state with emphasis (filled color, border highlight)
  - Inactive state (ghost/outline style)
- "All" represented by either all segments unselected or a separate "All" button
- Responds to click to call `setPriorityFilter(min, max)`
- Uses existing `PRIORITY_RANGES` from `useInboxFilters.ts`
- Uses theme tokens from `theme/theme.ts` for consistency
- Inline styles to match existing codebase pattern (no CSS modules)

**Props interface:**
```typescript
interface VisualPriorityFilterProps {
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}
```

### Phase 2: Create `VisualCategoryFilter` Component (if applicable)

**New file:** `client/src/components/inbox/VisualCategoryFilter.tsx`

If the design reference also covers category filters (to be confirmed by Codebeard viewing the reference):

- Horizontal scrollable row of category chips/pills
- Each chip shows category name + optional email count
- Toggleable (multi-select) with visual active/inactive states
- "All" chip as first item

If the reference only covers priority, keep the existing `MultiSelectDropdown` for categories.

### Phase 3: Update `InboxFilters.tsx`

- Replace the `SingleSelectDropdown` for priority with `<VisualPriorityFilter>`
- Optionally replace the category `MultiSelectDropdown` with `<VisualCategoryFilter>`
- Keep `MultiSelectDropdown` for account filter (less frequently used, dropdown is fine)
- Update the filter bar layout to accommodate the new visual components
- The filter bar should feel more like a "toolbar" than a "form"

### Phase 4: Responsive Design

- On narrow screens, visual pills should wrap or become scrollable
- Ensure touch targets are adequate (≥44px) for mobile
- Test with the existing `useResponsiveBreakpoints` hook

### Phase 5: Accessibility

- Ensure keyboard navigation (arrow keys to move between segments, Enter/Space to toggle)
- ARIA roles: `role="radiogroup"` for the priority selector with `role="radio"` per option
- Visible focus indicators
- Color should not be the only differentiator (add icons or patterns)

### Files to Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/VisualPriorityFilter.tsx` | **NEW** — Visual priority range selector |
| `client/src/components/inbox/VisualCategoryFilter.tsx` | **NEW** (if applicable) — Visual category chips |
| `client/src/components/inbox/InboxFilters.tsx` | Replace `SingleSelectDropdown` with `VisualPriorityFilter`; optionally replace category dropdown |
| `client/src/hooks/useInboxFilters.ts` | No changes needed — state shape and `PRIORITY_RANGES` stay the same |
| `client/src/components/inbox/inboxFilters.helpers.ts` | May add color mapping helper for priority tiers |

### Files NOT to Change

- `useInboxFilters.ts` — The hook's interface and state shape remain identical. The visual redesign is purely presentational.
- `InboxContext.tsx` / `InboxProvider.tsx` — No context changes needed.
- `Inbox.tsx` — The `<InboxFilters>` props interface stays the same; changes are internal to the component.

---

## Storybook Story Requirements

**New file:** `client/src/stories/InboxFilters.stories.tsx`

Stories to create:

1. **VisualPriorityFilter — Default** — No selection ("All" active)
2. **VisualPriorityFilter — Very High Selected** — Shows the default new-user state
3. **VisualPriorityFilter — Medium Selected** — Mid-range selection
4. **VisualPriorityFilter — Interactive** — With `args` controls for selectedMin/selectedMax
5. **InboxFilters — Full Filter Bar** — Complete filter bar with all three filters, using mock data for accounts and categories
6. **InboxFilters — Single Account** — Account filter hidden (only 1 account)
7. **InboxFilters — Loading States** — While accounts/categories load

Story helpers needed:
- Mock connected accounts data
- Mock category data
- Wrapper with i18n provider (existing pattern: `I18nextProvider`)

Follow existing story patterns in `client/src/stories/` — use real components, provide mock data via props, wrap in `I18nextProvider`.

---

## Screenshot Requirements

Screenshots to capture and upload via `bash scripts/upload-screenshot.sh`:

1. **Before:** Current filter bar with dropdowns (for comparison)
2. **After — Default state:** Visual filter bar with "Very High" selected
3. **After — Multiple filters active:** Priority + category filters active
4. **After — All priorities:** No priority filter active
5. **After — Mobile view:** Responsive layout on narrow viewport

Upload each to R2 and include public URLs in the PR description.

---

## Testing Strategy

- **Existing tests:** `inboxFilters.helpers.test.ts` and `useInboxFilters.test.ts` should continue to pass (no hook changes)
- **New unit tests:** `VisualPriorityFilter.test.tsx` — click interactions, active state rendering, accessibility attributes
- **Storybook visual testing:** Stories serve as visual regression baseline
- **Manual testing:** Verify filter state persists in localStorage, API calls use correct parameters

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Design reference inaccessible to Codebeard | Medium | Plan describes the pattern clearly; fallback to segmented control |
| Priority state shape change needed | Low | Current `(min, max)` pair maps directly to visual segments |
| Breaking existing filter persistence | Low | No changes to `useInboxFilters` hook or localStorage schema |
| Accessibility regressions | Medium | Explicit a11y requirements in plan; test with keyboard |

---

## Summary

This is a **UI-only change** — the filter state management, API integration, and localStorage persistence are untouched. The work is:

1. Build `VisualPriorityFilter` (new component) — the main deliverable
2. Optionally build `VisualCategoryFilter` (new component)
3. Swap into `InboxFilters.tsx` replacing the dropdown(s)
4. Add Storybook stories
5. Capture & upload screenshots

**Estimated complexity:** Medium — new component creation with no backend changes.

---

*Plan authored by Monk of Modularity 🧘 — investigation and planning only, no code changes.*
