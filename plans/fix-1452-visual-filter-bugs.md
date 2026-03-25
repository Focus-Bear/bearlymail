# Plan: Fix #1452 — Visual Filter Bugs

> **Issue:** #1452  
> **PR:** #1417 (merged) introduced visual priority range slider  
> **Agent:** Monk of Modularity 🧘  
> **Date:** 2026-03-25  

## Executive Summary

PR #1417 replaced the old pill-based priority filter with a dual-thumb range slider using 5 visual buckets (0–20–40–60–80–100). However, the new bucket boundaries **do not match** the actual priority score ranges used by the server and progressive unlock system. This single root cause underlies bugs 3 and 4, while bugs 1 and 2 are independent state-initialisation issues.

---

## Underlying Problem: Bucket/Score Mismatch

The **old** system used these priority score ranges (matching actual `priorityScore` values in the DB):

| Tier | Server SQL condition | Old client `min` | Old client `max` |
|------|---------------------|-------------------|-------------------|
| Very High | `> 50` | 50 | null |
| High | `> 30 AND <= 50` | 30 | 50 |
| Medium | `> 15 AND <= 30` | 15 | 30 |
| Low | `>= 0 AND <= 15` | 0 | 15 |
| Very Low | `< 0` | null | 0 |

The **new** `priorityBuckets.ts` introduced in PR #1417 uses:

| Tier | New bucket `min` | New bucket `max` |
|------|-------------------|-------------------|
| Very High | 80 | null |
| High | 60 | 80 |
| Medium | 40 | 60 |
| Low | 20 | 40 |
| Very Low | 0 | 20 |

These new values are sent directly to the server as `minPriority`/`maxPriority` query params, where the SQL does `priorityScore >= $min`. Since actual scores range from roughly -10 to ~60, sending `minPriority: 80` (new VH bucket) returns almost nothing.

---

## Bug 1: Filter Panel Expanded by Default

### Symptom
The filter bar (category + priority slider) is visible on page load. Expected: collapsed, user clicks filter icon to expand.

### Root Cause
**File:** `client/src/hooks/useInboxFilters.ts` line 142  
```ts
const [isFilterBarVisible, setIsFilterBarVisible] = useState(true);
```
The initial state is `true`. Should be `false`.

### Fix
```ts
const [isFilterBarVisible, setIsFilterBarVisible] = useState(false);
```

**Scope:** 1-line change in `useInboxFilters.ts`.

---

## Bug 2: Guided Inbox Should Start with Very High

### Symptom
New users start with "All priorities" (null/null). The guided triage flow (progressive unlock) expects the user to start on Very High and work down through tiers.

### Root Cause
**File:** `client/src/hooks/useInboxFilters.ts` lines 131–138  
PR #1435 changed the default for new users from `VERY_HIGH_PRIORITY_THRESHOLD` to `null/null` ("All"), reasoning that new users would see empty inbox during initial prioritisation. But this breaks the progressive unlock flow entirely — when all priorities are shown, the "you've triaged all Very High emails, unlock High?" prompt never triggers.

The gate system (`usePrioritisationGate.ts`) handles the initial prioritisation phase separately. Once the gate lifts (`justUngated`), the Inbox useEffect (line 166) switches to VH — but this only fires on the gate transition, NOT on subsequent visits.

For returning users who already have `GATE_FILTER_SWITCHED_KEY` in localStorage, the filter is whatever was last stored. If they cleared it to "All", they stay on "All".

### Fix
Two changes needed:

1. **Default to Very High for new users** — revert the PR #1435 change:
   ```ts
   // line 138 — change from:
   return { accountIds: [], categories: [], minPriority: null, maxPriority: null };
   // to:
   return { accountIds: [], categories: [], minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };
   ```

2. **But** use the CORRECT threshold value (see Bug 4 fix below). The `VERY_HIGH_PRIORITY_THRESHOLD` constant (currently 50) needs to remain 50 because that's the actual server score threshold. The slider must translate between visual positions and actual scores (see Bug 4).

**Scope:** 1-line change in `loadInitialFilters()`, plus depends on Bug 4 fix for correctness.

---

## Bug 3: Bucket Counts Don't Match Tab Count

### Symptom
VL(5) + L(7) + M(16) + H(16) + VH(1) = 45, but Triage tab shows 142.

### Root Cause (two issues)

**Issue 3a: `getPriorityCounts` doesn't filter by inbox mode**

**File:** `server/src/emails/email-status.service.ts` lines 149–181  
The `getPriorityCounts` query counts ALL non-archived threads regardless of inbox mode (triage/action/follow-up). It has no `starCount` filter. The Triage tab count uses `getInboxSummary("triage")` which includes mode-specific filtering (star count, etc.).

Fix: The `getPriorityCounts` endpoint should accept a `mode` parameter and apply the same mode-based filtering as `getInboxSummary`.

**Issue 3b: Bucket boundaries don't match server SQL ranges**

**File:** `client/src/constants/priorityBuckets.ts`  
The visual bucket boundaries (0-20-40-60-80-100) don't match the server's SQL ranges (VL: <0, L: 0-15, M: 15-30, H: 30-50, VH: >50). Counts returned by `getPriorityCounts` use the old server ranges, but the UI labels them as if they're on the new 0-100 scale.

Example: Server returns `veryHigh: 1` (scores > 50). The UI shows this under the "Very High" label at position 80-100. But when the user selects that bucket, the client sends `minPriority: 80, maxPriority: null` to the server, which returns 0 results (no scores ≥ 80).

### Fix

**Option A (recommended): Align client buckets to server ranges**

Update `priorityBuckets.ts` to use the actual score boundaries:
```ts
export const PRIORITY_BUCKET_DEFS: PriorityBucketDef[] = [
  { label: 'All',       min: null, max: null },
  { label: 'Very Low',  min: null, max: 0    },
  { label: 'Low',       min: 0,    max: 15   },
  { label: 'Medium',    min: 15,   max: 30   },
  { label: 'High',      min: 30,   max: 50   },
  { label: 'Very High', min: 50,   max: null },
];
```

The slider then needs to translate between visual positions (0-100 for even spacing) and actual score values. Add a mapping layer:
- Visual slider position 0-20 → score range `null` to `0` (Very Low)
- Visual slider position 20-40 → score range `0` to `15` (Low)
- Visual slider position 40-60 → score range `15` to `30` (Medium)
- Visual slider position 60-80 → score range `30` to `50` (High)  
- Visual slider position 80-100 → score range `50` to `null` (Very High)

The `PriorityRangeSelector` keeps its even visual spacing but `onChange` emits actual score values. The `selectedMin`/`selectedMax` props receive actual scores and the component maps them to visual positions.

**Option B: Add mode filter to `getPriorityCounts`**

Even with Option A, the mode-filtering gap remains. Either:
1. Add `mode` param to `GET /emails/priority-counts` and apply the same WHERE clauses as `getInboxSummary`, OR
2. Replace the `usePriorityCounts` hook entirely — derive bucket counts from the `inbox-summary` response which already has per-category data, or add a `priorityCounts` field to the inbox-summary response.

**Recommended: Do both Option A and Option B.**

### Scope
- `client/src/constants/priorityBuckets.ts` — revert to old score ranges
- `client/src/components/inbox/PriorityRangeSelector.tsx` — add score↔visual mapping
- `server/src/emails/email-status.service.ts` — add mode filter to `getPriorityCounts`
- `server/src/emails/emails.controller.ts` — accept mode param on endpoint
- `client/src/hooks/usePriorityCounts.ts` — pass current mode
- Update tests

---

## Bug 4: Slider Visual Desynced from Actual Filter

### Symptom
When progressive unlock sets filter to "High" (minPriority: 30, maxPriority: 50), the slider thumbs show at positions 30 and 50 on the 0-100 scale, which visually falls in the "Low → Medium" range (buckets 20-40 and 40-60).

### Root Cause
**File:** `client/src/components/inbox/PriorityRangeSelector.tsx` lines at the bottom  
```tsx
const minVal = selectedMin ?? 0;
const maxVal = selectedMax ?? 100;
```

`selectedMin` receives `filters.minPriority` (an actual score like 30), but the slider treats it as a visual position on the 0-100 bucket scale. Score 30 → visual position 30 → bucket "Low" (20-40). The actual meaning of score 30 is "High" threshold.

The progressive unlock system (`EmailListStates.tsx`) uses old thresholds:
- `nextMin: HIGH_PRIORITY_THRESHOLD` (30) → `nextMax: VERY_HIGH_PRIORITY_THRESHOLD` (50)

These are correct server-side scores but wrong visual positions.

### Fix
This is **the same fix as Bug 3 Option A** — add a score↔visual position mapping layer:

```ts
// In PriorityRangeSelector.tsx or a shared utility:
const SCORE_TO_VISUAL: Array<{ scoreMin: number | null; scoreMax: number | null; visualMin: number; visualMax: number }> = [
  { scoreMin: null,  scoreMax: 0,    visualMin: 0,  visualMax: 20 },  // Very Low
  { scoreMin: 0,     scoreMax: 15,   visualMin: 20, visualMax: 40 },  // Low
  { scoreMin: 15,    scoreMax: 30,   visualMin: 40, visualMax: 60 },  // Medium
  { scoreMin: 30,    scoreMax: 50,   visualMin: 60, visualMax: 80 },  // High
  { scoreMin: 50,    scoreMax: null, visualMin: 80, visualMax: 100 }, // Very High
];

function scoreToVisual(score: number | null, isMin: boolean): number { ... }
function visualToScore(visual: number, isMin: boolean): number | null { ... }
```

The slider displays visual positions but emits/receives actual score values.

### Scope
- `client/src/components/inbox/PriorityRangeSelector.tsx` — add mapping
- `client/src/constants/priorityBuckets.ts` — add mapping table or restore old ranges
- Possibly shared utility file

---

## Implementation Order

1. **Bug 1** (1-line fix, no dependencies)
2. **Bug 3 + Bug 4** (same underlying fix — bucket/score mapping layer)
3. **Bug 2** (depends on correct threshold values from #3/#4 fix)

Bugs 3 and 4 should be fixed together as a single coherent change since they share the same root cause.

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/hooks/useInboxFilters.ts` | Bug 1: `useState(false)`. Bug 2: default to VH. |
| `client/src/constants/priorityBuckets.ts` | Bug 3+4: Restore old score ranges as data, add visual mapping. |
| `client/src/components/inbox/PriorityRangeSelector.tsx` | Bug 3+4: Map between visual positions and actual scores. |
| `server/src/emails/email-status.service.ts` | Bug 3: Add mode-based filtering to `getPriorityCounts`. |
| `server/src/emails/emails.controller.ts` | Bug 3: Accept `mode` param on `/priority-counts`. |
| `client/src/hooks/usePriorityCounts.ts` | Bug 3: Pass mode to endpoint. |
| `client/src/components/inbox/EmailListStates.tsx` | Verify thresholds still work after mapping (should be fine — thresholds are score values). |

## Test Updates
- `client/src/hooks/usePriorityCounts.test.ts` — new mode param
- `client/src/components/inbox/PriorityRangeSelector` tests — verify score↔visual mapping
- `server/src/emails/emails.controller.spec.ts` — mode param on priority-counts
- `client/src/hooks/useInboxFilters` tests — default state changes
