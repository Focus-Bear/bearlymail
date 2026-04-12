# Plan: Fix False 'Inbox Zero' When Only Medium/Low Priority Emails Remain

**Issue:** [#1434](https://github.com/Focus-Bear/BearlyMail/issues/1434)
**Branch:** `openclaw/plan-1434-false-inbox-zero`
**Priority:** P1
**Planned by:** Monk of Modularity (AI)

---

## Problem Summary

When a user's priority filter is set to "Very High" (≥50) and all Very High emails have been triaged, the inbox shows "No new emails to triage! You're all caught up" — even when Medium and Low priority emails still exist. This is a false inbox-zero state that misleads users into thinking they have no work left.

## Prior Work

PR #1435 (merged to `main`) introduced the progressive unlock chain in `EmailListStates.tsx` with `findNextNonEmptyTier()` and `TIER_CHAIN`. This mostly works but has **three remaining edge cases** that still produce false inbox zero:

### Edge Case 1: Dismiss → Generic EmptyState (misleading)

When the user clicks "Maybe Later" on the `ProgressiveUnlockPrompt`, `isUnlockPromptDismissed` becomes `true`. The `EmptyInboxContent` function then falls through the progressive-unlock branch (because `hasActiveFilter` is false when dismissed) and renders the **generic `EmptyState`** — which shows "No new emails to triage!" with no indication that lower-priority emails exist.

**Root cause:** `EmptyInboxContent` line ~133-134:

```tsx
const hasActiveFilter =
  !isUnlockPromptDismissed && minPriority !== null && minPriority !== undefined;
```

Dismissal disables the _entire_ active-filter branch, including the AllCaughtUp check and any hint about remaining emails.

### Edge Case 2: Missing `priorityCounts` prop → Generic EmptyState

If `priorityCounts` is `null` (still loading, or fetch failed), the progressive unlock guard condition at line ~137 fails:

```tsx
if (hasActiveFilter && priorityCounts && onUnlockPriorityTier && onDismissUnlockPrompt) {
```

This falls through to the `EmptyState` fallback. During the window between email list loading and priority-counts loading, users see false inbox zero.

### Edge Case 3: `veryLow` tier not in TIER_CHAIN

`TIER_CHAIN` only covers VH→High, High→Medium, Medium→Low. There's no entry for Low→VeryLow. If a user has only `veryLow` priority emails, `findNextNonEmptyTier` returns `null` and the code falls through to the `allLowerTiersEmpty` check — which correctly checks `veryLow === 0`, so this case should show `EmptyState` (not `AllCaughtUpState`). However, the generic `EmptyState` still says "No new emails to triage!" without mentioning the very-low-priority emails exist.

---

## Root Cause Analysis

### File Map

| File                                                             | Role                                                              | Lines of Interest                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `client/src/components/inbox/EmailListStates.tsx`                | Progressive unlock orchestration; empty/caught-up state selection | `EmptyInboxContent` function (~line 115-170)                 |
| `client/src/components/inbox/states/EmptyState.tsx`              | Generic "no emails" — shows misleading "all caught up" text       | Entire file (30 lines)                                       |
| `client/src/components/inbox/states/AllCaughtUpState.tsx`        | True "all caught up" state                                        | Entire file (25 lines)                                       |
| `client/src/components/inbox/states/ProgressiveUnlockPrompt.tsx` | Prompt to drop to lower tier                                      | Entire file (50 lines)                                       |
| `client/src/hooks/usePriorityCounts.ts`                          | Fetches `/emails/priority-counts`                                 | Async fetch, can be null during loading                      |
| `client/src/hooks/useInboxFilters.ts`                            | Priority filter state; threshold constants                        | `VERY_HIGH_PRIORITY_THRESHOLD=50`, etc.                      |
| `client/src/locales/en.json`                                     | i18n strings for inbox states                                     | Lines 172-176, 365-366                                       |
| `client/src/components/inbox/EmailListStates.test.tsx`           | Unit tests for state selection logic                              | Covers happy path but not dismiss+remaining-emails edge case |

### Critical Code Path

```
Inbox.tsx
  → InboxContent.tsx (passes minPriority, priorityCounts, onUnlockPriorityTier)
    → InboxContentParts.tsx / InboxEmailListPanel (computes emailsEmpty)
      → EmailListStates (decides which state component to render)
        → EmptyInboxContent function:
          1. hasActiveFilter? + priorityCounts? + nextTier? → ProgressiveUnlockPrompt ✅
          2. hasActiveFilter? + allLowerTiersEmpty? → AllCaughtUpState ✅
          3. FALLBACK → EmptyState ❌ (this is the bug — no context about remaining emails)
```

The fallback at step 3 is reached when:

- User dismissed the prompt (isUnlockPromptDismissed=true)
- priorityCounts is null/loading
- Filter is active but no unlock callbacks provided (defensive case)

In ALL these cases, if lower-priority emails exist, the user sees a misleading "No new emails to triage!" message.

---

## Implementation Plan

### Change 1: Add `FilteredEmptyState` component

**New file:** `client/src/components/inbox/states/FilteredEmptyState.tsx`

A new component shown when a priority filter is active, the current tier is empty, but lower-priority emails exist. Replaces the generic `EmptyState` in the dismissed/fallback path.

```tsx
interface FilteredEmptyStateProps {
  currentTierLabel: string; // e.g. "Very High priority"
  lowerPriorityCount: number; // total emails in lower tiers
  onShowAll: () => void; // clears priority filter to show all
}
```

UI mockup:

```
┌─────────────────────────────────────┐
│              📭                      │
│                                     │
│  No Very High priority emails       │
│                                     │
│  You have 12 lower priority emails  │
│  waiting to be triaged.             │
│                                     │
│  [Show all emails]                  │
└─────────────────────────────────────┘
```

**Why a new component?** The existing `EmptyState` is mode-aware (triage/action/follow-up) but not priority-filter-aware. Adding filter awareness to it would bloat its interface. A separate component keeps concerns clean.

### Change 2: Fix `EmptyInboxContent` dismiss fallback

**File:** `client/src/components/inbox/EmailListStates.tsx`

Refactor `EmptyInboxContent` to handle the dismissed state properly:

```tsx
function EmptyInboxContent({ ... }): React.ReactElement {
  const hasActiveFilter = minPriority !== null && minPriority !== undefined;
  const isPromptEligible = !isUnlockPromptDismissed && hasActiveFilter;

  // 1. Progressive unlock prompt (not dismissed, has next tier)
  if (isPromptEligible && priorityCounts && onUnlockPriorityTier && onDismissUnlockPrompt) {
    const nextTier = findNextNonEmptyTier(minPriority as number, priorityCounts);
    if (nextTier) {
      const nextCount = priorityCounts[nextTier.nextCountKey] as number;
      return <ProgressiveUnlockPrompt ... />;
    }
  }

  // 2. True "all caught up" — ALL tiers genuinely empty
  if (hasActiveFilter && priorityCounts) {
    const totalLower = priorityCounts.high + priorityCounts.medium
                     + priorityCounts.low + priorityCounts.veryLow;
    if (totalLower === 0) {
      return <AllCaughtUpState />;
    }
  }

  // 3. NEW: Filter active + lower-priority emails exist (dismissed OR loading)
  if (hasActiveFilter && priorityCounts) {
    const totalLower = computeTotalLowerPriority(minPriority as number, priorityCounts);
    if (totalLower > 0) {
      return (
        <FilteredEmptyState
          currentTierLabel={getCurrentTierLabel(minPriority as number, t)}
          lowerPriorityCount={totalLower}
          onShowAll={onClearFilters}  // new prop — see Change 4
        />
      );
    }
  }

  // 4. Genuine empty (no filter, or priorityCounts still loading)
  return <EmptyState mode={mode} />;
}
```

Key changes:

- `hasActiveFilter` no longer gated by `isUnlockPromptDismissed` — dismissal only affects the prompt, not the awareness of remaining emails
- New step 3 catches the dismissed case and shows `FilteredEmptyState`
- `AllCaughtUpState` check simplified: if all lower tiers are 0, it's truly caught up
- Generic `EmptyState` only reached when no filter is active OR priorityCounts hasn't loaded yet

### Change 3: Add helper functions

**File:** `client/src/components/inbox/EmailListStates.tsx`

```tsx
/**
 * Compute total email count in tiers below the given minPriority.
 */
function computeTotalLowerPriority(
  minPriority: number,
  counts: PriorityCounts,
): number {
  let total = 0;
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD) total += counts.high;
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) total += counts.medium;
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD) total += counts.low;
  if (minPriority >= LOW_PRIORITY_THRESHOLD) total += counts.veryLow;
  return total;
}

/**
 * Human-readable label for the current priority filter tier.
 */
function getCurrentTierLabel(minPriority: number, t: TFunction): string {
  if (minPriority >= VERY_HIGH_PRIORITY_THRESHOLD)
    return t("inbox.priority.veryHigh");
  if (minPriority >= HIGH_PRIORITY_THRESHOLD) return t("inbox.priority.high");
  if (minPriority >= MEDIUM_PRIORITY_THRESHOLD)
    return t("inbox.priority.medium");
  return t("inbox.priority.low");
}
```

### Change 4: Thread `onClearFilters` callback through

**Files:** `EmailListStates.tsx`, `InboxContentParts.tsx`, `InboxContent.tsx`, `Inbox.tsx`

Add a new prop `onClearFilters?: () => void` to `EmailListStatesProps` and `EmptyInboxProps`. Wire it from `Inbox.tsx` where `clearFilters` + `fetchEmails` are already available:

```tsx
// Inbox.tsx — add to InboxContent props:
onClearFilters={() => {
  clearFilters();
  fetchEmails();
}}
```

This lets `FilteredEmptyState` offer a "Show all emails" button that clears the priority filter.

### Change 5: Update `EmptyState` for non-filtered empty

**File:** `client/src/components/inbox/states/EmptyState.tsx`

No changes needed — this component now ONLY renders when there's genuinely no filter active and no emails. Its current messaging ("No new emails to triage!") is correct for that case.

### Change 6: i18n strings

**File:** `client/src/locales/en.json`

Add:

```json
{
  "inbox": {
    "priority": {
      "veryHigh": "Very High priority",
      "high": "High priority",
      "medium": "Medium priority",
      "low": "Low priority"
    },
    "filteredEmpty": {
      "title": "No {{tier}} emails",
      "hasLowerPriority": "You have {{count}} lower priority email(s) waiting to be triaged.",
      "showAll": "Show all emails"
    }
  }
}
```

### Change 7: Export `FilteredEmptyState` from states/index.ts

**File:** `client/src/components/inbox/states/index.ts`

Add:

```ts
export { FilteredEmptyState } from "components/inbox/states/FilteredEmptyState";
```

---

## Testing Plan

### New Unit Tests

**File:** `client/src/components/inbox/EmailListStates.test.tsx`

Add these test cases:

1. **Dismiss → FilteredEmptyState (not generic EmptyState):**
   - `minPriority=50`, `priorityCounts={high:0, medium:5, low:2, veryLow:0}`, click "Later"
   - Assert: `FilteredEmptyState` shown with count=7, NOT generic `EmptyState`

2. **Dismiss → AllCaughtUpState when truly empty:**
   - `minPriority=50`, `priorityCounts={high:0, medium:0, low:0, veryLow:0}`, click "Later"
   - Assert: `AllCaughtUpState` shown

3. **VH filter, high=0, medium=5 → ProgressiveUnlockPrompt skips to medium:**
   - `minPriority=50`, `priorityCounts={high:0, medium:5, low:0, veryLow:0}`
   - Assert: prompt shown with medium tier (already tested, but verify skip works)

4. **VH filter, high=0, medium=0, low=3 → ProgressiveUnlockPrompt skips to low:**
   - `minPriority=50`, `priorityCounts={high:0, medium:0, low:3, veryLow:0}`
   - Assert: prompt shown with low tier

5. **priorityCounts=null → generic EmptyState (loading gracefully):**
   - `minPriority=50`, `priorityCounts=null`
   - Assert: generic `EmptyState` shown (acceptable during loading)

6. **FilteredEmptyState "Show all" button calls onClearFilters:**
   - Render with dismissed prompt + lower priority emails
   - Click "Show all emails"
   - Assert: `onClearFilters` called

**File:** `client/src/components/inbox/states/FilteredEmptyState.test.tsx` (new)

- Renders tier label and count correctly
- "Show all emails" button calls `onShowAll`
- Does not render "Show all" button when `onShowAll` is undefined

### Updated Test Mocks

Update the `jest.mock('components/inbox/states')` block in `EmailListStates.test.tsx` to include `FilteredEmptyState`:

```tsx
FilteredEmptyState: ({ currentTierLabel, lowerPriorityCount, onShowAll }: any) => (
  <div data-testid="filtered-empty-state">
    <span>{currentTierLabel}: {lowerPriorityCount}</span>
    {onShowAll && <button data-testid="show-all-btn" onClick={onShowAll}>Show all</button>}
  </div>
),
```

---

## Risk Assessment

| Risk                                                                  | Severity | Mitigation                                                                        |
| --------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| New prop `onClearFilters` not threaded correctly                      | Low      | Prop is optional; fallback renders `FilteredEmptyState` without "Show all" button |
| `priorityCounts` null during loading shows generic EmptyState briefly | Low      | Acceptable trade-off; alternative (loading spinner) would be worse UX             |
| Existing progressive unlock tests break                               | Low      | Only additive changes to `EmptyInboxContent`; existing test scenarios unchanged   |
| i18n key conflicts                                                    | Very Low | New namespace `filteredEmpty` doesn't conflict with existing keys                 |

---

## Files Changed Summary

| File                                                             | Change Type | Estimated Lines     |
| ---------------------------------------------------------------- | ----------- | ------------------- |
| `client/src/components/inbox/states/FilteredEmptyState.tsx`      | **New**     | ~60                 |
| `client/src/components/inbox/states/FilteredEmptyState.test.tsx` | **New**     | ~40                 |
| `client/src/components/inbox/states/index.ts`                    | Modified    | +1                  |
| `client/src/components/inbox/EmailListStates.tsx`                | Modified    | ~40 changed         |
| `client/src/components/inbox/EmailListStates.test.tsx`           | Modified    | ~80 added           |
| `client/src/components/inbox/InboxContentParts.tsx`              | Modified    | ~5 (prop threading) |
| `client/src/components/inbox/InboxContent.tsx`                   | Modified    | ~5 (prop threading) |
| `client/src/pages/Inbox.tsx`                                     | Modified    | ~3 (prop wiring)    |
| `client/src/locales/en.json`                                     | Modified    | ~10                 |

**Total estimated:** ~250 lines new/changed across 9 files.

---

## Implementation Order

1. Create `FilteredEmptyState` component + tests
2. Add helper functions (`computeTotalLowerPriority`, `getCurrentTierLabel`) to `EmailListStates.tsx`
3. Refactor `EmptyInboxContent` in `EmailListStates.tsx`
4. Thread `onClearFilters` prop through `InboxContent` → `InboxContentParts` → `EmailListStates`
5. Add i18n strings
6. Update and add unit tests
7. Export from `states/index.ts`
