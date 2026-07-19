# Email Categorisation Pipeline

**Purpose**: The single reference for how an email thread gets its category. If you are changing anything that writes `EmailThread.categoryId`, read this first and update it after.

> Debugging a pile-up of emails in "Other"? Start with the
> [Other-category runbook](debugging-other-category-runbook.md) — it covers the
> deferral paths (org volume cap, inactivity) that bypass this pipeline entirely.

## The data model

- `EmailThread.categoryId` (UUID, nullable) is the **only** source of truth for a thread's category. It references a `UserContext` row with `contextKey = EMAIL_CATEGORY`.
- **`categoryId = NULL` means "Other"**. There is no "Other" context row and no denormalised name column (removed in #1293).
- `UserContext.contextValue` stores the category as `"Name - Description"` (sometimes emoji-prefixed). `parseCategoryName()` extracts the display name; each category also has a short stable `categoryKey` used in LLM prompts.
- `EmailThread.protoCategoryId` points at a **proto-category**: a staging bucket for suggested categories mined from "Other" emails. A thread can be "Other" (`categoryId` null) and belong to a proto at the same time.
- Supporting columns: `categorySource` (`'priority'` today; see precedence work), `categoryExplanation`, `categoryRuleTrace` (deterministic-rule trace snapshot), `localModelDebug` (shadow snapshot), `categoryDecisionTrace`.

## The intended flow: rules → local model → LLM

Both the single (`REFINE_PRIORITY`) and batch (`REFINE_PRIORITY_BATCH`) refine paths run the same three-stage sequence per email; the first stage that claims the email short-circuits the rest.

```
new email persisted (email-lifecycle.service.ts)
  ├─ enqueue FETCH_GITHUB_METADATA          (parallel; see GitHub override below)
  └─ enqueue REFINE_PRIORITY[_BATCH]        (5s debounce)
        │
        ▼
  0. skip-check   shouldSkipPriorityRecalculation
        │           (valid existing breakdown + no new mail + no force → stop)
        ▼
  1. RULES        llm-deterministic-priority.service.ts
        │           requires PRIORITY_RULE_SKIP_ENABLED (default ON)
        │           AND a matching priority rule AND a matching category rule
        │           (minus PRIORITY_RULE_SHADOW_SAMPLE_RATE, default 10%, which
        │            still runs the LLM for comparison)
        │           → writes categoryId from the rule, prioritySource='rule'
        ▼ (no match)
  2. LOCAL MODEL  local-model-promotion.service.ts
        │           requires LOCAL_MODEL_LIVE_ENABLED + per-user model
        │           priority head must be confident; category applied when it
        │            resolves, else null — priority still applied and the
        │            thread stays "Other"
        │           LOCAL_MODEL_HOLDOUT_SAMPLE_RATE % of would-be-applied
        │            threads are diverted to the LLM for accuracy measurement
        │           → writes categoryId (name→UUID resolve, family narrowing),
        │             band-midpoint priorityScore, prioritySource='local'
        ▼ (not confident / disabled)
  3. LLM          priority-analysis.service.ts → llm-priority-result.service.ts
                    categories are presented as `"Name" [id: <categoryKey>]`
                    (shortlisted first by CategoryShortlistService when the
                     list is large); a matching category RULE is injected as a
                    hint before the call and overrides the LLM's category after
                    → resolution ladder below
```

### Stage 3 resolution ladder (`llm-priority-result.service.ts → resolveCategoryAndProtoCategory`)

1. `applyCategoryKeyResolution` maps a returned `categoryKey` back to the display name.
2. `canonicaliseCategoryName` + `lookupCategoryContextId` resolve the name to a `categoryId`.
3. A matched category rule's `ruleCategoryId` wins when the name no longer resolves (rename protection).
4. Only when `categoryId` is still null: `applyDirectProtoMatch` fuzzy-matches the name against proto-categories (exact emoji-stripped name, else Levenshtein/embedding candidates confirmed by a strong LLM — see #2550/#2467 guards).
5. LLM said "Other" with a `protoCategorySuggestion`: match a full category → match/assign an existing proto (may auto-promote) → create a new proto.
6. GitHub reserved-category override supersedes the result when the thread has GitHub links.

## Out-of-band writers

These run outside the three-stage flow and also write `categoryId`:

| Writer | Trigger | Behaviour |
| --- | --- | --- |
| **GitHub override** (`github-category-override.service.ts`) | `FETCH_GITHUB_METADATA` job; also applied inline in stages 1 and 3 | Reserved categories ("PRs awaiting your review" / "Bot updates") always win when GitHub links match. |
| **Proto auto-promotion** (`proto-categories.service.ts`) | A proto reaching `PROMOTION_THRESHOLD` (5) threads, synchronously during stage 3 | Re-runs dedup against real categories; folds into an existing category or creates a new one, then **bulk re-points every thread in the proto**. |
| **Category consolidation** (`category-consolidation.service.ts`) | `POST /context/consolidate-categories` | Family-scoped LLM dedup; merges loser → survivor, re-pointing threads AND category rules. |
| **User manual override** (`POST /emails/:id/category-override`) | User action | Writes `categoryId` + a `CategoryOverride` audit row. |
| **Recategorisation** (`context-category.service.ts`) | "Generate categories from Other" | Not a direct writer — enqueues `REFINE_PRIORITY` with `forceRecalculate` for `categoryId IS NULL` threads. |

## Category rules (deterministic)

- Stored in `category_rules`: legacy hash rules (exact sender / domain / subject prefix) and **composite** rules (`fromMatchesAny` / `subjectContainsAny` / `bodyContainsAny` + NOT-contains exclusions).
- Rules link to their category by **UUID** (`categoryId`); the name is derived from the UUID at write time (#2553). Rules with a broken/null link are excluded from matching and self-healed by name on read (`healBrokenCategoryLinks`), with an admin bulk backfill as a fallback.
- Created three ways: manual CRUD (UUID picker), LLM-suggested (`POST /category-rules/suggest`, reviewed by the user before saving), and auto-generated from confident LLM categorisations (gated by thread-count + derived exclusions).
- Evaluation: composite rules first (creation order), then legacy hash probes. A category-rule match alone does **not** skip the LLM (only combined with a priority-rule match, stage 1) — it pins the category as hint + post-hoc override.

## Name → UUID resolution

The canonical resolver is `category-rules-validate.helper.ts`:
`findCategoryContextIdByName` / `buildCategoryNameToContextIdMap`, which compare the **parsed name portion** of `contextValue`, case-insensitively, tolerating a leading emoji prefix (`normaliseCategoryNameForMatch`). **Do not write a new name matcher** — every private re-implementation so far has diverged (whole-value compares that silently never match described categories).

Name matching is a *fallback*. Anything that can carry the UUID should carry the UUID.

## Environment flags

| Flag | Default | Effect |
| --- | --- | --- |
| `PRIORITY_RULE_SKIP_ENABLED` | on | Stage 1 rule short-circuit |
| `PRIORITY_RULE_SHADOW_SAMPLE_RATE` | 0.1 | Fraction of rule-matched emails that still run the LLM for comparison |
| `LOCAL_MODEL_SHADOW_ENABLED` | off | Log local-vs-LLM agreement without writing categories |
| `LOCAL_MODEL_LIVE_ENABLED` | off | Stage 2 local-model promotion (a confident priority applies even without a confident category) |
| `LOCAL_MODEL_HOLDOUT_SAMPLE_RATE` | 0 | % of confident local decisions diverted to the LLM for applied-accuracy eval |

## Known sharp edges

- **Last-write-wins**: the out-of-band writers and stage 3 all write `categoryId` without a precedence policy; a later job can move a category an earlier (or more authoritative) writer set. In particular a **user manual override is not yet locked** against later refine runs.
- `canonicaliseCategoryName` still does longest-prefix fuzzy matching on LLM name output; constraining the LLM to return `categoryKey` only would make resolution a dictionary lookup.
- Proto promotion moves whole cohorts of threads at once; guards in #2550 and the `categoryId === null` gate keep it from overriding resolved categories, but it remains the most powerful writer.
