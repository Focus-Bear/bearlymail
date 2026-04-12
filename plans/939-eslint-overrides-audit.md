# Plan: Audit and Eliminate ESLint Overrides (#939)

**Issue:** [#939 – Audit eslint overrides](https://github.com/Focus-Bear/BearlyMail/issues/939)  
**Author:** Monk of Modularity (AI agent) via OpenClaw  
**Date:** 2026-03-22  
**Status:** Phase 5 in progress — this document describes the full remaining work

---

## Background

Jeremy's original request (issue #939):

> "We've got too many files excluded from eslint in the eslint config overrides. We don't want to allow any bad code. Audit the overrides and create a plan to improve them. Also with max-params: we extended this to allow 30 params which is pointless. We should make it only allow that many params in constructors."

Several phases have already been completed (Phase 0 through Phase 4). This plan documents the **current state of overrides** as of 2026-03-22 and proposes the **remaining phases to reach zero structural overrides**.

---

## Current State of Overrides (2026-03-22 Audit)

### A. Inline `eslint-disable` Comments

**Total: 2** (dramatic reduction from 16 in March 2026 audit)

| File                                 | Line | Rule                                 | Reason                                                                | Verdict                                                   |
| ------------------------------------ | ---- | ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `client/src/pages/ResetPassword.tsx` | 59   | `no-console`                         | Dev-only debug logging guarded by `!production` check                 | **Retain** — legitimate use; only fires in dev            |
| `server/src/emails/llm-processor.ts` | 622  | `@typescript-eslint/no-explicit-any` | Batch result type from `priority-analysis.service` lacks typed return | **Fix** — type the return value of `analyzePriorityBatch` |

**Orphan `eslint-enable` comments (no matching disable):**

| File                                                             | Lines   | Rule                        | Verdict                                                                                                                                 |
| ---------------------------------------------------------------- | ------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/inbox/debug/DebugThreadLookupSection.tsx` | 57, 122 | `i18next/no-literal-string` | **Remove** — orphaned `eslint-enable` with no matching disable; file is already covered by the `**/debug/**` override in `.eslintrc.js` |

### B. TypeScript Suppressions

| File                                               | Type               | Reason                                                        | Verdict                                                                     |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `client/src/stories/SplitViewPanel.stories.tsx:84` | `@ts-ignore`       | Partial mock for story isolation                              | **Acceptable** — Storybook file, well-commented                             |
| `client/src/utils/posthog.ts:16`                   | `@ts-expect-error` | `exception_autocapture` option not yet in `@types/posthog-js` | **Retain until types updated** — correct pattern; track PostHog type update |

### C. Structural Overrides in `.eslintrc.js` Files

#### Server — `server/.eslintrc.js`

**Override Block 1: God-class files (extreme limits)**

Files: `src/emails/llm-processor.ts`, `src/context/context.service.ts`

| Rule                     | Override Value | Standard Value | Reason                      |
| ------------------------ | -------------- | -------------- | --------------------------- |
| `max-lines`              | 4000           | 800            | Files pending decomposition |
| `max-lines-per-function` | 1200           | 100            | Large methods pending split |
| `max-statements`         | 400            | 30             | Legacy code                 |
| `complexity`             | 250            | 20             | Legacy code                 |
| `id-denylist`            | `off`          | error          | Legacy naming               |
| `max-params`             | **30**         | 13             | ⚠️ WRONG — see below        |

**Actual line counts:**

- `llm-processor.ts`: **2,086 lines** (limit 4000 — under limit but still 2.6× the standard)
- `context.service.ts`: **3,757 lines** (limit 4000 — close to override limit)

**Override Block 2: `llm.service.ts`**

| Rule                     | Override Value | Standard Value |
| ------------------------ | -------------- | -------------- |
| `max-lines`              | 4000           | 800            |
| `max-lines-per-function` | 1200           | 100            |
| `max-statements`         | 400            | 30             |
| `complexity`             | 250            | 20             |
| `max-params`             | **30**         | 13             |

**Actual line count:** `llm.service.ts`: **3,217 lines** — single-param constructor (`llmCoreService` only). The `max-params: 30` override is **completely unjustified** for this file.

#### Client — `client/.eslintrc.js`

**i18n overrides (files/patterns where `i18next/no-literal-string` is disabled or relaxed):**

| Pattern                                                        | Rule Value                  | Justification                                 | Verdict                                                     |
| -------------------------------------------------------------- | --------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Test files (`**/*.test.ts`, etc.)                              | `off`                       | Tests don't need i18n                         | ✅ Correct                                                  |
| Config files (`*.config.js`, `setupTests.ts`)                  | `off`                       | Not user-facing                               | ✅ Correct                                                  |
| `**/terms/**`, `**/privacy/**`, `**/legal/**`                  | `off`                       | Legal content intentionally English           | ✅ Correct (confirm with Jeremy)                            |
| `**/booking/**`                                                | `warn`                      | May be intentionally English                  | ⚠️ Review — downgrade from error to warn may be too lenient |
| `**/debug/**`, `DebugPanel.tsx`, `ReplyComposerDebugPanel.tsx` | `off`                       | Developer-only panels                         | ✅ Correct                                                  |
| `**/components/github/GitHubProject.tsx`                       | `off`                       | External API data (GitHub names)              | ✅ Correct                                                  |
| `**/ErrorBoundary.tsx`                                         | `off`                       | May crash before i18n context                 | ✅ Correct                                                  |
| `**/*.stories.tsx`, etc.                                       | `off`                       | Dev-only Storybook                            | ✅ Correct                                                  |
| `**/stories/storyHelpers/**`                                   | `off`                       | Dev-only fixtures                             | ✅ Correct                                                  |
| `**/*.types.ts`                                                | `no-restricted-syntax: off` | Union type strings                            | ✅ Correct                                                  |
| `SanitizedHTML.tsx`                                            | `react/no-danger: off`      | DOMPurify wrapper — single auditable location | ✅ Correct                                                  |

**Global rule change (not override):** `'react/no-danger': 'off'` in global rules — documented with comment.

**Pages override:**

| Pattern          | Rule                     | Value         |
| ---------------- | ------------------------ | ------------- |
| `**/pages/*.tsx` | `max-lines-per-function` | warn, max 200 |

Largest pages: `EmailDetail.tsx` (690 lines), `ContactDetail.tsx` (624 lines), `Stats.tsx` (551 lines).

---

## Critical Issues: `max-params: 30`

**Jeremy's explicit requirement:** `max-params` should only allow 30 in **constructors**, not all functions.

### Current Problem

The server eslint config sets `max-params: 30` globally for three god-class files. ESLint's `max-params` rule in v8 does **not** support `ignoreConstructors` — only v9/flat config does.

### Actual Constructor Param Counts

| File                 | Constructor Params | Standard Limit              |
| -------------------- | ------------------ | --------------------------- |
| `context.service.ts` | **17 params**      | 13                          |
| `llm-processor.ts`   | **16 params**      | 13                          |
| `llm.service.ts`     | **1 param**        | 13 — **no override needed** |

### Solution

The ESLint v8 workaround for constructor-only param exemption is `overrides` with `max-params` for specific files, or migrate to ESLint v9 flat config which supports `ignoreConstructors: true`. Short-term: tighten `max-params` from 30 to the actual maximum needed (17 for `context.service.ts`, 16 for `llm-processor.ts`). Final fix: remove override once constructors are decomposed.

---

## Phased Elimination Plan

### Phase 5A — Immediate Cleanups (Low effort, ~1–2h)

**Goal:** Remove obviously wrong or orphaned suppressions.

1. **Remove orphan `eslint-enable` comments** from `DebugThreadLookupSection.tsx` lines 57 and 122 — no matching `eslint-disable`; file is already covered by `**/debug/**` override.

2. **Remove `max-params: 30` from `llm.service.ts` override** — its constructor takes only 1 param; the override is a copy-paste error. Tighten to standard 13.

3. **Fix `no-explicit-any` in `llm-processor.ts:622`** — type the return of `analyzePriorityBatch`. The comment says "batch result type" — add an explicit type or interface.

4. **Review `booking/**`i18n downgrade from`error`to`warn`** — if booking pages need i18n, promote back to `error`and add`t()` calls.

**Files:** `DebugThreadLookupSection.tsx`, `server/.eslintrc.js`, `llm-processor.ts`, `client/.eslintrc.js`

---

### Phase 5B — Tighten `max-params` to Realistic Values (~2–3h)

**Goal:** Change `max-params: 30` to the actual constructor param count, then add a TODO to decompose further.

1. `context.service.ts` override: change `max-params` from 30 → 17 (actual constructor count).
2. `llm-processor.ts` override: change `max-params` from 30 → 16 (actual constructor count).

Once these constructors are decomposed (Phase 5G below), this override can be removed entirely.

---

### Phase 5C — Decompose `llm-processor.ts` (Medium effort, ~16–24h)

**Current state:** 2,086 lines with override allowing 4,000 lines, functions up to 1,200 lines.

**Target:** Split into `llm-summary-processor.ts` + `llm-priority-processor.ts` (already identified in Phase 5 comment in eslintrc).

After split: both files should comply with standard 800-line limit. Remove `llm-processor.ts` from override block.

**Suggested Codebeard PR:** `fix/939-decompose-llm-processor`

---

### Phase 5D — Decompose `context.service.ts` (Large effort, ~40–60h)

**Current state:** 3,757 lines — closest to the 4,000-line override ceiling.

**Target:** Split into 5 domain-specific context services (already identified in eslintrc comment):

- `context-crud.service.ts` — CRUD operations
- `context-gmail-data.service.ts` — Gmail data fetching (note: this was already removed from override per eslintrc comment, suggesting some work done)
- `context-analysis.service.ts` — AI analysis orchestration
- `context-category.service.ts` — Category management
- `context-pii-redaction.service.ts` — PII handling

After decomposition: remove `context.service.ts` from override block.

**Suggested Codebeard PRs:** Multiple PRs (5–6) targeting one sub-service extraction each.

---

### Phase 5E — Decompose `llm.service.ts` (Large effort, ~40–60h)

**Current state:** 3,217 lines. Constructor is already lean (1 param). The size bloat is in methods.

**Target:** Split into 8 domain-specific LLM services (per comment in eslintrc from Phase 5f note):
Possible splits by function domain (email summarization, priority analysis, reply drafting, classification, context, etc.)

After decomposition: remove `llm.service.ts` from override block.

**Suggested Codebeard PRs:** Multiple PRs targeting one domain each.

---

### Phase 5F — Client Pages Decomposition (~16–24h)

**Current state:** Pages override allows `max-lines-per-function: 200` (double the 100 standard).

Largest violators:

- `EmailDetail.tsx` (690 lines) — main inbox page, likely has a large render function
- `ContactDetail.tsx` (624 lines)
- `Stats.tsx` (551 lines)
- `Contacts.tsx` (396 lines)

**Target:** Extract sub-components from large pages until all page components comply with standard 100-line function limit. Then remove the pages override block.

---

### Phase 5G — Final Override Removal

After Phases 5C–5F, remove all remaining override blocks from `server/.eslintrc.js` and `client/.eslintrc.js`. Run `npm run lint` to confirm zero violations. Close issue #939.

---

## Summary Table

| Phase | Description                                                  | Effort | Risk   | Priority         |
| ----- | ------------------------------------------------------------ | ------ | ------ | ---------------- |
| 5A    | Remove orphans, fix copy-paste errors, fix `no-explicit-any` | ~2h    | Low    | **P0 — do now**  |
| 5B    | Tighten `max-params` to actual values (30→17, 30→16)         | ~1h    | Low    | **P0 — do now**  |
| 5C    | Decompose `llm-processor.ts`                                 | ~20h   | Medium | P1               |
| 5D    | Decompose `context.service.ts`                               | ~50h   | High   | P1               |
| 5E    | Decompose `llm.service.ts`                                   | ~50h   | High   | P1               |
| 5F    | Client pages decomposition                                   | ~20h   | Medium | P2               |
| 5G    | Remove final override blocks                                 | ~2h    | Low    | P3 (after 5C–5F) |

---

## i18n Override Assessment

Per Jeremy's rules: **`eslint-disable` for `i18next/no-literal-string` is NEVER acceptable** in source files.

Current status: **No inline `eslint-disable` for i18n exists in source files.** All i18n suppressions are in `.eslintrc.js` overrides for appropriate file categories (debug panels, test files, Storybook, legal content, etc.).

Remaining concern: `**/booking/**` is downgraded to `warn` instead of `error`. If booking pages show user-facing strings, they should be promoted to `error` and translated.

**Action:** Review booking components (`SlotSelection.tsx`, `BookingForm.tsx`, `BookingSuccessState.tsx`, `BookingLoadingState.tsx`) for untranslated user-facing strings and add `t()` calls.

---

## Notes

- `SplitViewPanel.stories.tsx:84` `@ts-ignore` — acceptable in Storybook story file.
- `posthog.ts:16` `@ts-expect-error` — correct pattern; can be removed once `@types/posthog-js` adds `exception_autocapture` to its type definitions.
- `ResetPassword.tsx:59` `no-console` disable — legitimate; only runs in dev mode (`!production`). Could be replaced with a project logger that no-ops in production, but the current pattern is acceptable.

---

_Created by Monk of Modularity (AI agent) via OpenClaw_
