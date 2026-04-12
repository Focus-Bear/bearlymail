# Plan: Issue #769 — Backfill unit tests for frontend business logic helpers

## Context

Several pure helper functions live in `.tsx` component files or have been recently extracted but lack unit tests. Jeremy flagged `BatchInfoBar.tsx` with `getNextDeliveryText()` and `getLastCheckText()` — these contain date formatting business logic that belongs in testable `.ts` utility files. The max-lines refactoring batches (#746–#761) extracted many such helpers but didn't add tests.

## Audit Step

Before implementing, run a full audit to find all untested helpers:

```bash
# Find helper functions in .tsx files that look like pure business logic
grep -rn "export const get\|export function get\|export const format\|export const build\|export const make\|export const calculate\|export const compute" client/src --include="*.tsx"

# Find .ts helper files without corresponding .test.ts files
find client/src -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts" | while read f; do
  test_file="${f%.ts}.test.ts"
  if [ ! -f "$test_file" ]; then echo "Missing test: $f"; fi
done
```

## Files to Change

### Batch 1: `BatchInfoBar.tsx` → extract to `batchInfoBar.helpers.ts`

**Move out of `client/src/components/inbox/batch-info-bar/BatchInfoBar.tsx`** (or wherever it lives):

- `getNextDeliveryText(nextDeliveryTime: Date | null): string`
- `getLastCheckText(lastCheckTime: Date | null): string`

**Create `client/src/components/inbox/batch-info-bar/batchInfoBar.helpers.ts`**:

- Pure functions only, no React imports
- JSDoc on each function explaining inputs/outputs/edge cases

**Create `client/src/components/inbox/batch-info-bar/batchInfoBar.helpers.test.ts`**:

- Test `getNextDeliveryText` with: null input, past date, future date < 1h, future date > 1h, future date > 24h
- Test `getLastCheckText` with: null input, just now, minutes ago, hours ago, days ago

### Batch 2: `inboxCategoryHelpers.ts`

**File**: `client/src/` (find exact path) — already a `.ts` file, needs test coverage.

**Create `inboxCategoryHelpers.test.ts`**:

- Test category grouping: correct grouping when multiple categories present, single category, empty list
- Test category sorting: correct sort order, tie-breaking logic
- Test edge cases: empty input, categories with identical priority, unknown category types

### Batch 3: `Sidebar.tsx` helpers

**Move out of `Sidebar.tsx`**:

- `getSettingsNavItems(...)` — builds navigation item array
- `makeScrollToSection(sectionId: string)` — returns scroll handler function

**Create `sidebar.helpers.ts`** (co-located with Sidebar component):

- Pure functions with no React imports (the scroll function returns a plain function, not a hook)

**Create `sidebar.helpers.test.ts`**:

- `getSettingsNavItems`: assert correct items returned for given permissions/flags, assert ordering
- `makeScrollToSection`: assert returned function calls `scrollIntoView` on the correct element (mock `document.getElementById`)

### Batch 4: `InboxFilters.tsx` helpers

**Move out of `InboxFilters.tsx`**:

- `getMultiSelectDisplayText(selectedValues: string[], allValues: string[]): string`

**Create `inboxFilters.helpers.ts`**:

- Pure string-building function

**Create `inboxFilters.helpers.test.ts`**:

- All selected → returns "All"
- None selected → returns "None" or empty placeholder
- Some selected → returns comma-joined list or truncated form (e.g., "3 selected")
- Single selected → returns that value

### Batch 5: `ContextAnalysisSection.tsx` helpers

**Audit `ContextAnalysisSection.tsx`** for any exported or locally-used pure functions (analysis card builders, score formatters, etc.).

Move any found to `contextAnalysis.helpers.ts` and write corresponding tests.

### Batch 6: Other helpers from max-lines batches #746–#761

After the audit, create remaining helper files and tests for anything discovered that isn't covered above.

## File Naming Convention

Follow the pattern established by existing helper files in the codebase:

- Co-locate with the component: `ComponentName.helpers.ts` and `ComponentName.helpers.test.ts`
- OR put in `utils/` if shared across multiple components: `utils/inboxUtils.ts` and `utils/inboxUtils.test.ts`

## Testing Standards

Each helper test file should:

- Use Vitest (check `client/package.json` for the test runner — likely Vitest given it's a Vite project)
- Cover **happy path**, **null/undefined inputs**, **empty inputs**, and **boundary conditions**
- Aim for >80% coverage per helper file (the issue requirement)
- Use descriptive `describe`/`it` blocks: `describe('getNextDeliveryText', () => { it('returns "No upcoming delivery" when null is passed', ...) })`
- No mocking of the helper itself — these are pure functions that don't need mocks (except DOM APIs for scroll helpers)

## Edge Cases

- **Date formatting helpers**: These may depend on the user's locale. Mock `Date.now()` or pass explicit timestamps to make tests deterministic. Consider using a fixed "now" parameter to avoid time-dependent test failures.
- **Functions that aren't truly pure**: If a helper reads from a store or context, it's not a pure helper and belongs in a hook, not a utility file. Only move truly pure functions.
- **Breaking the component**: After moving a function out, the component must import it from the new helper file. Run `cd client && npm run build` to confirm no import errors.
- **Duplicate function names**: The audit may find similar functions in multiple components (e.g., multiple `formatDate` variants). Do NOT merge them unless their behaviour is identical — create separate helpers to preserve individual semantics.

## Implementation Order

Work through batches from highest business logic complexity to lowest:

1. BatchInfoBar helpers (known trigger, date logic)
2. InboxFilters helpers (string building)
3. Sidebar helpers (navigation structure)
4. InboxCategoryHelpers (category logic)
5. ContextAnalysis helpers
6. Anything from audit

Each batch = one commit pair:

- Commit 1: "Move [helpers] from [Component].tsx to [component].helpers.ts"
- Commit 2: "Add unit tests for [component] helpers"

## Test Approach

- `cd client && npm run test` — full test suite passes before and after
- `cd client && npm run test -- --coverage` — confirm >80% coverage on each new helper file
- `cd client && npm run lint` — no new lint violations from the move
- `cd client && npm run build` — confirm no import/compilation errors

## Acceptance Criteria

- All business logic helpers identified in the audit are in dedicated `.ts` files (not `.tsx`).
- Unit tests exist for every extracted helper with >80% coverage.
- All test cases pass.
- No logic regressions (component behaviour unchanged).
- `cd client && npm run lint` exits 0.
- `cd client && npm run build` exits 0.
