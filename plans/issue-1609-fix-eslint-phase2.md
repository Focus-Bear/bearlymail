# Plan: Fix All Remaining Client ESLint Warnings (Phase 2)

**Issue:** #1609
**Author:** Monk of Modularity 🧘 (AI agent)
**Supersedes:** `plans/issue-1609-eslint-tighten.md` (Phase 1 — merged via PR #1611)

---

## Current State (Audit 2026-04-04)

### Server ✅ Complete

- `--max-warnings=0` already enforced (merged in PR #1611)
- All production rules at `error` severity
- Magic numbers (`@typescript-eslint/no-magic-numbers`) → `error` ✅
- Magic strings (`no-restricted-syntax`) → `error` ✅
- **0 warnings, 0 errors** — no further server work needed

### Client — 212 Warnings Remaining

| Count | Rule | Category |
|------:|------|----------|
| 83 | `max-lines-per-function` | Function too long (>100 lines) |
| 59 | `no-restricted-syntax` | Magic strings (comparisons, colors, i18n) |
| 26 | `id-denylist` | Generic variable names (`data`, `val`, etc.) |
| 13 | `no-nested-ternary` | Nested ternary expressions |
| 10 | `max-statements` | Too many statements (>30) |
| 8 | `react-hooks/exhaustive-deps` | Missing hook dependencies |
| 6 | `complexity` | Cyclomatic complexity >20 |
| 5 | `react/no-array-index-key` | Array index used as React key |
| 1 | `max-lines` | File >800 lines |
| 1 | `no-restricted-imports` | Relative import in story file |

#### `no-restricted-syntax` Breakdown (59 total)

| Count | Sub-category |
|------:|-------------|
| 45 | Magic strings in comparisons (`===`, `!==` with string literals) |
| 10 | Inline color magic strings in JSX `style` props |
| 2 | Inline color magic strings in style assignments |
| 2 | String literals in JSX ternary (should use `t()` for i18n) |

---

## Phased Fix Plan

### Phase 2A — Quick Wins (est. 1–2 hours)
**Target: 15 warnings eliminated**

1. **`no-restricted-imports` (1 warning)**
   - File: `src/stories/LoginFormSection.stories.tsx`
   - Fix: Change relative import `'../components/auth/LoginFormSection'` to absolute `'components/auth/LoginFormSection'`

2. **`no-nested-ternary` (13 warnings)**
   - Refactor nested ternaries into early returns, helper functions, or lookup objects
   - Heaviest file: `src/components/inbox/VisualCategoryFilter.tsx` (5 warnings) — likely one render function with cascading ternaries; extract to a helper or switch

3. **`max-lines` (1 warning)**
   - File: `src/hooks/useEmailDetailOperations.ts`
   - Extract helper functions or split into focused hooks

### Phase 2B — Magic Strings & Colors (est. 3–4 hours)
**Target: 59 warnings eliminated**

Priority sub-phases:

1. **Inline colors (12 warnings)** — Extract hex codes and color names into a `constants/colors.ts` or theme tokens file
   - 10 in JSX `style` props across multiple components
   - 2 in style assignments
   - Files: `IcsInviteCard.tsx` (8), `PriorityRangeSelector.tsx` (6), `CategoryOverrideModal.tsx` (6), `OverflowMenu.tsx` (4), etc.

2. **Comparison magic strings (45 warnings)** — Extract string literals used in `===`/`!==` comparisons into named constants
   - Top files: `IcsInviteCard.tsx`, `PriorityRangeSelector.tsx`, `CategoryOverrideModal.tsx`, `QAndASection.tsx`
   - Common pattern: `status === 'pending'` → `status === ICS_STATUS.PENDING`
   - Group by domain: ICS statuses, priority levels, UI states

3. **JSX i18n strings (2 warnings)** — Wrap string literals in `t()` calls
   - Already in JSX expression containers — straightforward i18n wrapping

### Phase 2C — Variable Renames (est. 1–2 hours)
**Target: 26 warnings eliminated**

- Rename generic identifiers (`data`, `val`, `cb`, etc.) to descriptive names
- Top files:
  - `src/components/inbox/debug/DebugPrioritySection.tsx` (7) — note: debug files have an ESLint override, verify if this file is covered
  - `src/hooks/useSearch.ts` (7)
  - `src/utils/axios-error-message.ts` (5)
  - `src/hooks/useBacklogProgress.ts` (2)
  - `src/queries/useThreadAssignment.ts` (2)
  - `src/queries/useValidateInvite.ts` (2)
  - `src/pages/Compose.tsx` (1)

⚠️ **Note:** `DebugPrioritySection.tsx` is in the `debug/` directory but NOT under the glob `**/debug/**/*.tsx` — verify if the override applies. If not, either add to the override or rename the variables.

### Phase 2D — React Best Practices (est. 2–3 hours)
**Target: 13 warnings eliminated**

1. **`react-hooks/exhaustive-deps` (8 warnings)**
   - Carefully review each case — some may need `useCallback`/`useMemo` wrappers, others may need the dependency added
   - Files: `RichTextEditor.tsx` (2), `useInboxModeChanges.ts` (2), `useAuthInitialization.ts` (1), `useAnalysisProgress.ts` (1), `useRecategorizeProgress.ts` (1), `useEmailDetailOperations.ts` (1)
   - ⚠️ **High risk** — incorrect dep changes can cause infinite re-render loops. Test each change.

2. **`react/no-array-index-key` (5 warnings)**
   - Replace array index keys with stable unique identifiers
   - Files: `ActionBuilder.tsx` (2), `VisualCategoryFilter.tsx` (1), `ConditionBuilder.tsx` (1), `WorkflowExecutionHistory.tsx` (1)

### Phase 2E — Function Complexity (est. 4–6 hours)
**Target: 99 warnings eliminated**

This is the largest batch and should be done incrementally.

1. **`max-lines-per-function` (83 warnings)** — Split long functions/components
   - 73 unique files affected
   - Strategy: Extract sub-components, custom hooks, and helper functions
   - Top files (multiple violations): `InboxContentParts.tsx` (3), `DealFormModal.tsx` (2), `ReplyRecipientsInput.tsx` (2), `EmailThreadView.tsx` (2), `VisualCategoryFilter.tsx` (2)
   - Suggest tackling in sub-batches of ~15-20 files per PR

2. **`max-statements` (10 warnings)** — Reduce statement count
   - Often overlaps with `max-lines-per-function` — fix together where possible
   - Extract utility functions, use early returns

3. **`complexity` (6 warnings)** — Reduce cyclomatic complexity
   - Extract conditional logic into helper functions or lookup tables
   - Files: `EmailDetailActions.tsx`, `IcsInviteCard.tsx`, `CategoryDebugModal.tsx`, `TeamSettingsSection.tsx`, `useInboxKeyboardNavigation.ts`, `mockEmail.ts`

### Phase 2F — Lock It Down (est. 30 min)
**Target: Prevent future regressions**

1. Promote all client `warn` rules to `error`:
   - `max-lines-per-function` → `error`
   - `max-statements` → `error`
   - `max-nested-callbacks` → `error`
   - `max-params` → `error`
   - `complexity` → `error`
   - `no-nested-ternary` → `error`
   - `no-restricted-syntax` → `error`
   - `react/no-array-index-key` → `error`
   - `no-restricted-imports` → `error`
   - `id-denylist` → `error`
   - `max-lines` → `error`
   - `prefer-const` → `error`
   - `prefer-template` → `error`
   - `no-param-reassign` → `error`
   - `react/jsx-boolean-value` → `error`
   - `react/jsx-max-depth` → `error`
   - `no-warning-comments` → `error`

2. Add `--max-warnings=0` to client lint script in `package.json`

3. Verify CI passes with zero warnings

---

## Recommended Order of Attack

```
Phase 2A (quick wins)        →  1 PR, ~15 warnings
Phase 2B (magic strings)     →  1-2 PRs, ~59 warnings
Phase 2C (variable renames)  →  1 PR, ~26 warnings
Phase 2D (React practices)   →  1 PR, ~13 warnings
Phase 2E (function splits)   →  3-4 PRs, ~99 warnings (batch by directory)
Phase 2F (lock down)         →  1 PR, 0 new warnings — just config changes
```

Total: ~7-9 PRs across ~12-18 hours of work

### Why This Order?

1. **Quick wins first** — builds momentum, reduces noise in linter output
2. **Magic strings next** — highest business value (prevents bugs from typos)
3. **Variable renames** — mechanical but important for readability
4. **React practices** — requires careful testing (especially exhaustive-deps)
5. **Function splits last** — largest effort, benefits from cleaner code in earlier phases
6. **Lock down** — only after all warnings are fixed

---

## Issue Comment from Owner

> Also review overrides in server — I think we're not blocking magic strings or numbers yet + some other bad practices that are being allowed.

**Finding:** Server ESLint config already enforces:
- `@typescript-eslint/no-magic-numbers` → `error` ✅
- `no-restricted-syntax` with `getPrompt()`, `captureEvent()`, and `tier`/`eventName` selectors → `error` ✅
- `no-nested-ternary` → `error` ✅
- `prefer-const` → `error` ✅
- `no-console` → `error` (except warn/error) ✅
- `@typescript-eslint/no-explicit-any` → `error` ✅

Server overrides are appropriately scoped (test files, config files, scripts, type definitions). No bad practices being allowed in production server code.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `exhaustive-deps` fixes cause infinite loops | Test each hook change in isolation; add integration tests |
| Function splits break component state | Keep state in parent; pass via props to extracted children |
| Magic string constants create import churn | Group constants by domain (e.g., `constants/ics.ts`, `constants/priorities.ts`) |
| Large number of PRs creates merge conflicts | Merge each phase before starting next; rebase frequently |
| `DebugPrioritySection` may already be covered by override | Verify before renaming — if override applies, skip |
