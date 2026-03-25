# Plan: Eliminate 231 ESLint Warnings on `client/`

> **Status:** Planning  
> **Branch:** `openclaw/monk-eslint-warnings`  
> **Created:** 2026-03-24  
> **Author:** Monk of Modularity 🧘 (AI agent)

## Summary

The `client/` directory has **231 ESLint warnings** across **99 files** on `main`.
This plan organises them into 6 phases, each producing 1–2 PRs of <400 changed lines.

## Warning Breakdown (actual counts from `main`)

| Count | Rule | Category |
|------:|------|----------|
| 72 | `max-lines-per-function` | Long functions (103–839 lines) |
| 70 | `@typescript-eslint/no-explicit-any` | Untyped `any` |
| 27 | `no-restricted-syntax` (magic strings) | Magic string comparisons |
| 10 | `no-restricted-syntax` (inline colors) | Inline color literals |
| 13 | `@typescript-eslint/no-unused-vars` | Dead imports/vars |
| 9 | `id-denylist` | Identifier `data` restricted |
| 8 | `no-nested-ternary` | Nested ternaries |
| 7 | `react-hooks/exhaustive-deps` | Missing hook deps |
| 6 | `max-statements` | Too many statements |
| 4 | `complexity` | Cyclomatic complexity |
| 3 | `react/no-array-index-key` | Array index keys |
| 1 | `max-lines` | File too long |

---

## Phase 1 — Low-Hanging Fruit (unused vars, dead imports)

**Rules:** `@typescript-eslint/no-unused-vars` (13), `id-denylist` (9), `react/no-array-index-key` (3)  
**Est. warnings fixed:** ~25  
**PRs:** 1  
**Estimated diff:** ~80 lines

### Files

| File | Rule | Count |
|------|------|------:|
| `src/hooks/settings/useAnalysisProgress.ts` | id-denylist | 8 |
| `src/components/inbox/CategoryAccordion.tsx` | no-unused-vars | 3 |
| `src/components/admin/JobsSection.tsx` | no-unused-vars | 1 |
| `src/components/settings/DataExportSection.tsx` | no-unused-vars | 1 |
| `src/components/rich-text/RichTextEditor.tsx` | no-unused-vars | 1 |
| `src/hooks/settings/useApiKeys.ts` | no-unused-vars | 1 |
| `src/hooks/settings/useAnalysisProgress.ts` | no-unused-vars | 1 |
| `src/hooks/useInboxState.ts` | no-unused-vars | 1 |
| `src/utils/dateUtils.ts` | no-unused-vars | 1 |
| various test files | no-unused-vars | ~3 |
| various | react/no-array-index-key | 3 |

### Approach
- Remove unused imports and variables
- Rename `data` → descriptive names (e.g., `progressData`, `analysisResult`)
- Add stable keys for array-index-key warnings (use item `.id` or generate)

---

## Phase 2 — Type Safety: `no-explicit-any` (70 warnings)

**Rule:** `@typescript-eslint/no-explicit-any`  
**Est. warnings fixed:** 70  
**PRs:** 2 (batch by test vs production code)

### PR 2a — Test files (~49 warnings, ~200 lines)

Most `any` usage is in test mocks/fixtures. Fix with proper typing or `unknown`.

| File | Count |
|------|------:|
| `src/hooks/useSearch.test.ts` | 14 |
| `src/hooks/useEmailManagement.test.ts` | 13 |
| `src/components/inbox/InboxCategoryItem.test.tsx` | 7 |
| `src/store/slices/emailSlice.test.ts` | 6 |
| `src/utils/emailUtils.test.ts` | 5 |
| `src/hooks/useKeyboardShortcuts.test.ts` | 3 |
| `src/hooks/useSplitView.test.ts` | 3 |
| `src/components/github/GitHubConnectionPrompt.test.tsx` | 2 |
| `src/components/github/GitHubLinksList.test.tsx` | 2 |
| `src/components/inbox/categoryAccordion.helpers.test.ts` | 2 |
| `src/contexts/AuthContext.test.tsx` | 2 |
| `src/hooks/useComposeForm.test.ts` | 2 |
| `src/hooks/useFollowUps.test.ts` | 2 |
| Other test files | ~4 |

### PR 2b — Production code (~21 warnings, ~150 lines)

Remaining `any` in hooks, utils, contexts. Replace with proper interfaces/generics.

| File | Count |
|------|------:|
| `src/hooks/useEmailFetching.ts` | ~3 |
| `src/contexts/InboxContext.tsx` | ~2 |
| `src/contexts/InboxProvider.tsx` | ~2 |
| `src/store/slices/inboxDataSlice.ts` | ~2 |
| Various hooks/components | ~12 |

### Approach
- Test files: replace `any` with `unknown`, `Partial<Type>`, or proper mock types
- Production code: define interfaces, use existing types from shared types, or use `unknown` + type guards

---

## Phase 3 — Magic Strings → Constants (27 warnings)

**Rule:** `no-restricted-syntax` (magic string comparisons)  
**Est. warnings fixed:** 27  
**PRs:** 1  
**Estimated diff:** ~200 lines (new constants file + replacements)

### Top files

| File | Count |
|------|------:|
| `src/components/inbox/PriorityRangeSelector.tsx` | 7 |
| `src/components/priority/CategoryOverrideModal.tsx` | 6 |
| `src/components/email-detail/EmailDetailActions.tsx` | 3 |
| `src/contexts/AuthContext.tsx` | 2 |
| `src/components/common/OverflowMenu.tsx` | 1 |
| `src/components/booking/BookingForm.tsx` | 1 |
| `src/components/settings/TroubleshootingSection.tsx` | 1 |
| Various other files | ~6 |

### Approach
- Create/extend `src/constants/` files per domain (e.g., `priorityConstants.ts`, `categoryConstants.ts`)
- Replace inline string literals with named constants
- Prefer `as const` objects or enums where appropriate

---

## Phase 4 — Inline Colors → Theme Tokens (10 warnings)

**Rule:** `no-restricted-syntax` (inline color magic strings)  
**Est. warnings fixed:** 10  
**PRs:** 1  
**Estimated diff:** ~80 lines

### Files

| File | Count |
|------|------:|
| `src/components/common/OverflowMenu.tsx` | 4 |
| `src/components/inbox/EmailListItem.tsx` | ~1 |
| `src/components/inbox/EmailPreview.tsx` | ~1 |
| Various other components | ~4 |

### Approach
- Move hex/rgb color literals to theme constants or existing theme tokens
- Create `src/constants/colors.ts` if a theme file doesn't exist, or extend existing theme
- Replace inline `color: '#...'` with `color: theme.colors.X`

---

## Phase 5 — Nested Ternaries → Extracted Logic (8 warnings)

**Rule:** `no-nested-ternary`  
**Est. warnings fixed:** 8  
**PRs:** 1  
**Estimated diff:** ~120 lines

### Files

| File | Count |
|------|------:|
| `src/components/inbox/VisualCategoryFilter.tsx` | 4 |
| `src/components/email-detail/EmailDetailActions.tsx` | 1 |
| `src/components/email-detail/SummarySection.tsx` | 1 |
| `src/components/feedback/FeedbackForm.tsx` | 1 |
| `src/components/email-detail-inline/ToneCheckResult.tsx` | 1 |

### Approach
- Extract nested ternaries into helper functions or early-return `if/else` blocks
- For JSX ternaries: extract into separate component or use a lookup map

---

## Phase 6 — Long Functions → Split & Simplify

**Rules:** `max-lines-per-function` (72), `max-statements` (6), `complexity` (4), `react-hooks/exhaustive-deps` (7), `max-lines` (1)  
**Est. warnings fixed:** ~90  
**PRs:** 2 (split by area)

> ⚠️ This phase is the largest and most nuanced. Many "max-lines" warnings come from
> component render functions that are legitimately long. Some will require extracting
> sub-components; others may need eslint config adjustments if the limit is too aggressive.

### PR 6a — Hooks & utilities (~30 warnings, ~350 lines)

| File | Notable |
|------|---------|
| `src/hooks/settings/useAnalysisProgress.ts` | 2 max-lines + 2 max-statements |
| `src/hooks/useEmailDetailOperations.ts` | max-lines + max-statements + max-lines |
| `src/hooks/useInboxKeyboardNavigation.ts` | max-statements + complexity |
| `src/hooks/useEmailFetching.ts` | max-lines-per-function |
| `src/hooks/useContactThreads.ts` | max-lines-per-function |
| Various test files | max-lines-per-function (long test suites) |

### PR 6b — Components (~40 warnings, ~350 lines)

| File | Lines over limit |
|------|-----------------|
| `src/components/compose/RecipientFields.tsx` | 296, 206 lines |
| `src/components/compose/TimePicker.tsx` | 169 lines |
| `src/components/inbox/InboxContentParts.tsx` | 3 warnings |
| `src/components/email-detail/EmailThreadView.tsx` | 2 warnings |
| `src/components/settings/SchedulingPreferencesSection.tsx` | 2 warnings |
| `src/components/search/SearchResults.tsx` | 2 warnings |
| Many more single-warning component files | 103–200 lines |

### Approach
- Extract sub-components from large render functions
- Move utility logic into separate hook files
- Split long hooks into composable smaller hooks
- For test files with `max-lines`: split into multiple test files or use `describe` blocks
- Fix `react-hooks/exhaustive-deps` by adding missing deps or restructuring effects
- For `complexity`: simplify conditionals using early returns or lookup tables

---

## Execution Order

```
Phase 1 (PR #1)  →  ~25 warnings, trivial changes
Phase 2a (PR #2) →  ~49 warnings, test file typing
Phase 2b (PR #3) →  ~21 warnings, production typing
Phase 3 (PR #4)  →  ~27 warnings, constants extraction
Phase 4 (PR #5)  →  ~10 warnings, theme tokens
Phase 5 (PR #6)  →  ~8 warnings, ternary cleanup
Phase 6a (PR #7) →  ~30 warnings, hook/util splitting
Phase 6b (PR #8) →  ~40 warnings, component splitting
```

**Total: 8 PRs, each <400 lines changed**

## Validation

After each PR, run:
```bash
cd client && npx eslint src/ --ext .ts,.tsx 2>&1 | grep -c "warning"
```
Expected warning count should decrease by the phase target.

## Notes

- The actual count is **231** (slightly more than the 230 estimate), likely due to a recent commit.
- `max-lines-per-function` (72 warnings) is the largest single rule — most are component render functions. Phase 6 will be the heaviest lift.
- `react-hooks/exhaustive-deps` (7 warnings) requires careful review — blindly adding deps can cause infinite re-render loops.
- Some files appear in multiple phases (e.g., `OverflowMenu.tsx` has magic strings + inline colors + long function). Each phase handles only its target rule.
