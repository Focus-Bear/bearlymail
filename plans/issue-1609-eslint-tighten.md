# Plan: Tighten ESLint — Zero Warnings + Enforce Magic Numbers/Strings

**Issue:** #1609
**Author:** Monk of Modularity 🧘 (AI agent)

---

## Current State (Audit 2026-03-31)

### Server

- **Lint script:** `eslint "{src,apps,libs,test}/**/*.ts" --fix --max-warnings=300`
- **Actual output:** 1 error (prettier formatting), 1 warning (`@typescript-eslint/no-explicit-any` in test)
- **`warn` rules in production code:** None — all production rules are `error`
- **`warn` rules in test overrides only:** `@typescript-eslint/no-explicit-any` (test files)
- **Magic numbers:** `@typescript-eslint/no-magic-numbers` → `error` ✅
- **Magic strings:** `no-restricted-syntax` with `getPrompt()`, `captureEvent()`, and `tier`/`eventName` selectors → `error` ✅
- **Max-warnings is set to 300 but only 1 warning exists** — massive headroom for regressions

### Client

- **Lint script:** `eslint src/ --ext .ts,.tsx,.js,.jsx` (no `--max-warnings` flag at all)
- **Actual output:** 0 errors, **191 warnings**
- **Warning breakdown by rule:**

| Count | Rule | Severity |
|------:|------|----------|
| 77 | `max-lines-per-function` | warn |
| 52 | `no-restricted-syntax` | warn |
| 21 | `id-denylist` | warn |
| 12 | `no-nested-ternary` | warn |
| 8 | `react-hooks/exhaustive-deps` | warn |
| 8 | `max-statements` | warn |
| 5 | `complexity` | warn |
| 5 | `react/no-array-index-key` | warn |
| 1 | `max-lines` | warn |
| 1 | `@typescript-eslint/no-unused-vars` | warn |
| 1 | `no-restricted-imports` | warn |

- **Magic numbers:** `no-magic-numbers` → `error` ✅ (already enforced)
- **Magic strings:** `no-restricted-syntax` selectors → `warn` ⚠️ (should be `error`)
- **Many structural rules at `warn`:** `max-lines-per-function`, `max-statements`, `complexity`, `max-nested-callbacks`, `max-params`, `max-lines`, `id-denylist`, `no-nested-ternary`, `prefer-const`, `prefer-template`, `no-param-reassign`, various React rules

### Server Overrides Review

Server overrides are well-scoped and appropriate:

1. **Test files** (`*.test.ts`, `*.spec.ts`) — relaxes `max-lines-per-function`, `max-lines`, `max-statements`, `no-magic-numbers`, `id-denylist`, `no-restricted-syntax`. `no-explicit-any` demoted to `warn`. ⚠️ This is the only `warn` in the server config.
2. **Config files** — relaxes `max-lines`, `id-length`, `no-var-requires`. Appropriate.
3. **Scripts** (`**/scripts/**/*.ts`) — relaxes `max-lines`, `max-lines-per-function` (200), `max-statements` (60), `no-console`, `no-restricted-syntax`. Appropriate for CLI tools.
4. **Type files** (`**/types/**/*.ts`) — `id-denylist` off. Appropriate (mirrors external APIs).

**Missing from server:** No gaps found. The `no-magic-numbers` and `no-restricted-syntax` rules are already at `error`. Jeremy's concern about "magic strings or numbers not being blocked" is already addressed — they ARE blocked.

---

## Plan

### Phase 1: Server — Tighten max-warnings to 0 (trivial)

**Files changed:** `server/package.json`

1. Change `--max-warnings=300` → `--max-warnings=0` in the lint script
2. Fix the 1 existing warning: change `@typescript-eslint/no-explicit-any` in test override from `'warn'` to `'off'` (tests already have relaxed type checking; `warn` just creates noise without blocking CI)
3. Fix the 1 prettier error in `email-search.service.ts` (auto-fixable with `--fix`)

**Estimated effort:** 5 minutes

### Phase 2: Client — Fix 191 warnings in batches, then enforce `--max-warnings=0`

This is the bulk of the work. Split into sub-phases to keep PRs reviewable.

#### Phase 2A: Promote `no-restricted-syntax` from `warn` → `error` (52 warnings)

The magic-strings enforcement selectors are at `warn`. These should be `error` to match server parity. Fix the 52 violations first:
- Most are magic string comparisons that need extracting to constants
- Switch cases with string literals need constant references
- JSX ternary/logical expressions need `t()` i18n wrapping

**Files changed:** `client/.eslintrc.js` + ~30-40 source files

#### Phase 2B: Fix `max-lines-per-function` violations (77 warnings)

The largest category. Options:
- Extract sub-components from large React components
- Extract utility functions from long handlers
- Where genuinely complex (page components), the existing override for `**/pages/*.tsx` (200 lines) already exists — may need a few more targeted overrides or component splits

**Files changed:** ~40-50 source files (component refactors)

#### Phase 2C: Fix `id-denylist` violations (21 warnings)

Rename variables using generic names (`data`, `val`, `obj`, etc.) to descriptive names. Straightforward but requires care to not break existing references.

**Files changed:** ~15-20 source files

#### Phase 2D: Fix remaining warnings (41 total)

| Count | Rule | Fix approach |
|------:|------|-------------|
| 12 | `no-nested-ternary` | Refactor to if/else or extract to variables |
| 8 | `react-hooks/exhaustive-deps` | Add missing deps or wrap in useCallback |
| 8 | `max-statements` | Extract helper functions |
| 5 | `complexity` | Simplify branching or extract strategies |
| 5 | `react/no-array-index-key` | Use stable keys from data |
| 1 | `max-lines` | Split large file |
| 1 | `@typescript-eslint/no-unused-vars` | Remove unused variable |
| 1 | `no-restricted-imports` | Convert to absolute import |

**Files changed:** ~25-30 source files

#### Phase 2E: Promote all client `warn` rules to `error` + add `--max-warnings=0`

After all violations are fixed:
1. Change every `'warn'` in `client/.eslintrc.js` to `'error'`
2. Add `--max-warnings=0` to the client lint script in `package.json`
3. Update test/config overrides: change `'warn'` to either `'off'` (if intentionally relaxed) or `'error'`

**Files changed:** `client/.eslintrc.js`, `client/package.json`

---

## Implementation Order

```
Phase 1  → Codebeard PR (server max-warnings=0)        ~5 min
Phase 2A → Codebeard PR (magic strings → error)         ~2-3 hrs
Phase 2B → Codebeard PR (max-lines-per-function fixes)  ~3-4 hrs
Phase 2C → Codebeard PR (id-denylist renames)            ~1-2 hrs
Phase 2D → Codebeard PR (remaining warnings)             ~2-3 hrs
Phase 2E → Codebeard PR (promote all warn → error)       ~30 min
```

Phases 2A-2D can be parallelized if desired, but sequential is safer to avoid merge conflicts. Phase 2E must come last.

---

## Risks & Notes

1. **Phase 2B is the riskiest** — component refactors can introduce bugs. Each split component needs careful props/state handling.
2. **`react-hooks/exhaustive-deps` fixes** may change runtime behavior (adding deps can cause re-renders). These need manual review.
3. **The `no-restricted-syntax` magic-string selectors in client** are broader than server's (they catch comparisons, switch cases, JSX expressions). Promoting to `error` may surface more violations as code evolves — this is intentional.
4. **Server is already in good shape** — the main concern Jeremy raised about missing magic numbers/strings enforcement is already handled. The only real server action is tightening max-warnings from 300 → 0.
