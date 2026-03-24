# Plan: Gate Inbox Until Emails Prioritised + Fix False Inbox Zero

**Issues:** #1433, #1434
**Branch:** `openclaw/monk-1433-inbox-gate`
**Author:** Monk of Modularity (AI agent)

---

## Problem Summary

### #1433 — Gate inbox until emails prioritised + "Analysing priority..." category

After signup, users see "inbox zero" because:
1. Emails are fetched but not yet prioritised — `priorityScore` defaults to `0`/`null`, which `COALESCE(priorityScore, 0)` maps to the "Low" tier (0-15)
2. The default filter for new users is `minPriority: 50` (Very High only) — set in `loadInitialFilters()` in `useInboxFilters.ts:131`
3. Since all emails are scored 0 (unprioritised), zero match the "Very High" filter → user sees `EmptyState` ("No new emails to triage!")
4. Unprioritised emails get `categoryId: null` → displayed as "Other" — no indication they're being analysed

**Four required changes:**
1. Default priority filter for brand-new users should be "All" (null/null), not "Very High (>50)"
2. Unprioritised emails should appear in an "Analysing priority..." virtual category with a spinner, not "Other"
3. Gate the inbox: don't show the email list until ≥20 emails have been prioritised; show a progress interstitial instead
4. After enough emails are prioritised, auto-switch the filter to "Very High" for the focused experience

### #1434 — False inbox zero when only medium/low priority emails remain

When the user's filter is "Very High" and all VH emails are cleared, `EmailListStates` checks `priorityCounts.high > 0` to offer progressive unlock. But if high is also 0, and medium/low have emails, the component falls through to `EmptyState` — showing "No new emails to triage!" which is misleading.

The progressive unlock chain is:
- VH → High (works ✅)
- High → Medium (works ✅)
- Medium → Low (works ✅)
- **VH → Medium/Low directly** (broken ❌ — skips when high=0)

---

## Root Cause Analysis

### File Map

| File | Role |
|------|------|
| `client/src/hooks/useInboxFilters.ts` | `loadInitialFilters()` — sets default filter to VH (>50) for new users (line 131) |
| `client/src/components/inbox/EmailListStates.tsx` | Progressive unlock chain — only steps down one tier at a time, can't skip |
| `client/src/components/inbox/states/EmptyState.tsx` | Generic "no emails" state — shown as fallback when no progressive unlock matches |
| `client/src/components/inbox/states/AllCaughtUpState.tsx` | "All caught up 🏆" — only shown when `minPriority < MEDIUM_PRIORITY_THRESHOLD && low === 0` |
| `client/src/components/inbox/inboxContentParts.helpers.ts` | `computeIsEmailsEmpty()` — determines if inbox is empty based on categorySummary or email count |
| `client/src/hooks/useOnboarding.ts` | Existing onboarding flow — scan modal, tour steps |
| `server/src/emails/email-inbox.service.ts` | `getInboxSummary()` — SQL uses `COALESCE(priorityScore, 0)` for filtering |
| `server/src/emails/email-status.service.ts:149` | `getPriorityCounts()` — same `COALESCE` pattern, unprioritised → "low" bucket |
| `server/src/database/entities/email-thread.entity.ts:70` | `priorityScore: number | null` — defaults to 0, nullable |
| `server/src/context/context.controller.ts` | `getAnalyzeProgress()` — returns progress percentage, batch counts, stage labels |
| `server/src/emails/email-inbox.service.ts:40` | `OTHER_CATEGORY_NAME = "Other"` — display name for null-category threads |
| `client/src/hooks/usePriorityCounts.ts` | Fetches `/emails/priority-counts` — provides tier counts for progressive unlock |

### Key Insight: `COALESCE(priorityScore, 0)` Conflation

The database treats unprioritised emails (`priorityScore IS NULL`) identically to genuinely low-priority emails (`priorityScore = 0`) via `COALESCE(priorityScore, 0)`. This means:
- `getPriorityCounts()` counts unprioritised emails in the "low" bucket
- `getInboxSummary()` with `minPriority=50` filters them out
- There's no way for the client to distinguish "not yet scored" from "scored as low priority"

---

## Implementation Plan

### Phase 1: Distinguish Unprioritised Emails (Backend)

**1A. Add `isPrioritised` flag to priority-counts response**

**File:** `server/src/emails/email-status.service.ts` (around line 149)

Add a count of threads where `priorityScore IS NULL` to the `getPriorityCounts()` response:

```sql
COUNT(*) FILTER (WHERE "priorityScore" IS NULL) AS "unprioritised"
```

Return shape becomes:
```ts
{ veryHigh: number; high: number; medium: number; low: number; veryLow: number; unprioritised: number }
```

**1B. Add unprioritised count to inbox-summary response**

**File:** `server/src/emails/email-inbox.service.ts`

In `getInboxSummary()`, add an `unprioritisedCount` field to the response that counts threads where `priorityScore IS NULL`:
```ts
return { total, categories, unprioritisedCount };
```

Add a separate count query or extend the existing one:
```sql
COUNT(*) FILTER (WHERE thread."priorityScore" IS NULL) AS "unprioritisedCount"
```

**1C. New endpoint: GET /emails/prioritisation-status**

**File:** `server/src/emails/emails.controller.ts`

Returns:
```ts
{
  totalThreads: number;       // all non-archived threads for user
  prioritisedCount: number;   // threads where priorityScore IS NOT NULL
  unprioritisedCount: number; // threads where priorityScore IS NULL
  isAnalysisRunning: boolean; // whether a context analysis job is active
}
```

This gives the client everything it needs for the gate logic. Implementation: simple SQL count + check analysis status from `ContextAnalysisProgressService`.

### Phase 2: "Analysing Priority..." Virtual Category (Frontend)

**2A. Inject virtual category into inbox summary display**

**File:** `client/src/components/inbox/InboxContentParts.tsx` (around line 620-640, where `displayCategories` is used)

When `unprioritisedCount > 0` from inbox-summary response:
- Prepend an "Analysing priority..." virtual category to the category list
- This category shows a spinner icon instead of a regular category icon
- Count = `unprioritisedCount`
- Not clickable/expandable (or expands to show a message explaining emails are being processed)

**File:** `client/src/components/inbox/states/AnalysingPriorityCategory.tsx` (new file)

New component for the virtual category row:
```tsx
<div>
  <Spinner /> Analysing priority... ({count} emails)
  <p>These emails are being processed. They'll appear in the right category once analysis completes.</p>
</div>
```

**2B. Update inbox-summary client hook to parse unprioritisedCount**

**File:** `client/src/hooks/useEmailFetching.ts` or wherever inbox-summary response is consumed

Extract `unprioritisedCount` from the response and make it available to the InboxContent tree.

### Phase 3: Gate Inbox Until Prioritisation Threshold Met (Frontend)

**3A. New hook: `usePrioritisationGate`**

**File:** `client/src/hooks/usePrioritisationGate.ts` (new file)

```ts
export function usePrioritisationGate() {
  // Fetch /emails/prioritisation-status on mount + poll every 5s while gated
  // Returns: { isGated: boolean; prioritisedCount: number; totalCount: number; isLoading: boolean }
  // Gate condition: prioritisedCount < 20 AND isAnalysisRunning
  // Once prioritisedCount >= 20 OR analysis not running → isGated = false
  // Store "gate dismissed" in sessionStorage so refresh doesn't re-gate after user saw inbox
}
```

**3B. Progress interstitial component**

**File:** `client/src/components/inbox/PrioritisationInterstitial.tsx` (new file)

Shown when `isGated === true`:
```
┌─────────────────────────────────────────┐
│                                         │
│     📊 Setting up your smart inbox      │
│                                         │
│  We're analysing your emails to         │
│  prioritise what matters most.          │
│                                         │
│  ████████░░░░░░░░░░  12/20 analysed     │
│                                         │
│  This usually takes a minute or two.    │
│                                         │
└─────────────────────────────────────────┘
```

**3C. Integrate gate into Inbox page**

**File:** `client/src/pages/Inbox.tsx` (around line 153, before the main return)

```tsx
const { isGated, prioritisedCount, totalCount } = usePrioritisationGate();

if (isGated) {
  return <PrioritisationInterstitial prioritised={prioritisedCount} total={Math.max(totalCount, 20)} />;
}
```

### Phase 4: Fix Default Priority Filter for New Users

**4A. Change first-visit default from VH to "All"**

**File:** `client/src/hooks/useInboxFilters.ts` (line 127-131)

Change the first-visit default:
```ts
// Before:
return { accountIds: [], categories: [], minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };

// After:
return { accountIds: [], categories: [], minPriority: null, maxPriority: null };
```

**4B. Auto-switch to VH after gate lifts**

**File:** `client/src/hooks/usePrioritisationGate.ts`

When the gate transitions from `isGated=true` to `isGated=false`:
- Check if filters are still "All" (the new-user default)
- If so, auto-switch to `minPriority: VERY_HIGH_PRIORITY_THRESHOLD` for the focused experience
- Set a localStorage flag `inbox_gate_graduated` so this only happens once

This preserves the original UX intent (start focused) while avoiding the false-empty problem during initial analysis.

### Phase 5: Fix False Inbox Zero (#1434)

**5A. Fix progressive unlock to skip empty tiers**

**File:** `client/src/components/inbox/EmailListStates.tsx`

Current logic checks one tier at a time. Refactor to find the **next non-empty tier**:

```tsx
// Replace the 3 sequential if-blocks with a tier chain:
const TIER_CHAIN = [
  { min: VERY_HIGH_PRIORITY_THRESHOLD, label: 'veryHighDone', countKey: 'high', nextMin: HIGH_PRIORITY_THRESHOLD, nextMax: VERY_HIGH_PRIORITY_THRESHOLD, nextLabel: 'highLabel' },
  { min: HIGH_PRIORITY_THRESHOLD, label: 'highDone', countKey: 'medium', nextMin: MEDIUM_PRIORITY_THRESHOLD, nextMax: HIGH_PRIORITY_THRESHOLD, nextLabel: 'mediumLabel' },
  { min: MEDIUM_PRIORITY_THRESHOLD, label: 'mediumDone', countKey: 'low', nextMin: LOW_PRIORITY_THRESHOLD, nextMax: MEDIUM_PRIORITY_THRESHOLD, nextLabel: 'lowLabel' },
];

// Find first tier below current that has emails:
function findNextNonEmptyTier(currentMin, priorityCounts) {
  const currentTierIndex = TIER_CHAIN.findIndex(t => currentMin >= t.min);
  for (let i = currentTierIndex; i < TIER_CHAIN.length; i++) {
    const tier = TIER_CHAIN[i];
    if (priorityCounts[tier.countKey] > 0) return tier;
  }
  return null; // truly all caught up
}
```

This allows VH → Medium (skipping High when high=0) and VH → Low (skipping High+Medium when both=0).

**5B. Update "All caught up" condition**

Current condition (line 146-153): only shows AllCaughtUpState when `minPriority < MEDIUM_PRIORITY_THRESHOLD && priorityCounts.low === 0`.

Should be: show AllCaughtUpState when **ALL** lower tiers are 0 (high + medium + low + veryLow all = 0), regardless of current `minPriority`.

**5C. Add "expand filter" prompt for medium/low emails**

When `emailsEmpty` is true and `minPriority >= VERY_HIGH_PRIORITY_THRESHOLD` and the next non-empty tier exists but user dismissed the progressive unlock, show a subtle hint instead of the generic EmptyState:

```
"No high priority emails right now. There are X medium/low priority emails — 
[Show all emails] to see them."
```

**File:** `client/src/components/inbox/states/EmptyState.tsx`

Add optional props for filtered-empty state:
```tsx
interface EmptyStateProps {
  mode: InboxMode;
  hasLowerPriorityEmails?: boolean;
  lowerPriorityCount?: number;
  onShowAll?: () => void;
}
```

### Phase 6: i18n Strings

**File:** `client/src/locales/en.json`

Add new keys:
```json
{
  "inbox": {
    "prioritisationGate": {
      "title": "Setting up your smart inbox",
      "subtitle": "We're analysing your emails to prioritise what matters most.",
      "progress": "{{count}} of {{total}} emails analysed",
      "patience": "This usually takes a minute or two."
    },
    "analysingPriority": {
      "label": "Analysing priority...",
      "description": "These emails are being processed. They'll appear in the right category once analysis completes."
    },
    "filteredEmpty": {
      "hasLowerPriority": "No high priority emails right now. There are {{count}} lower priority emails.",
      "showAll": "Show all emails"
    }
  }
}
```

**File:** `client/src/locales/es.json` — add Spanish equivalents.

---

## Testing Strategy

### Unit Tests

1. **`usePrioritisationGate`** — test gate/ungate transitions, sessionStorage persistence, polling stop
2. **`EmailListStates`** — test tier-skipping: VH filter + high=0, medium=5 → should offer medium unlock
3. **`computeIsEmailsEmpty`** — no changes needed, but verify existing tests still pass
4. **`loadInitialFilters`** — verify new default is null/null for first visit, migration still works for existing users
5. **`getPriorityCounts` backend** — verify `unprioritised` count is correct when some threads have NULL priorityScore

### Integration Tests

1. **New user flow:** Sign up → see gate → wait for prioritisation → gate lifts → see focused inbox
2. **Progressive unlock skip:** Clear VH emails → high=0, medium=5 → offered medium, not stuck on "no emails"
3. **Dismiss + hint:** Dismiss progressive unlock → see hint about lower priority emails

### Manual QA Checklist

- [ ] New user sees interstitial during initial analysis
- [ ] Interstitial shows progress bar updating in real-time
- [ ] Gate lifts after ≥20 emails prioritised
- [ ] After gate lifts, filter auto-switches to "Very High"
- [ ] "Analysing priority..." category appears with spinner for remaining unprioritised emails
- [ ] Category disappears once all emails are prioritised
- [ ] Existing users (with localStorage filters) are NOT affected by gate or default change
- [ ] Progressive unlock skips empty tiers correctly
- [ ] "All caught up" only shows when truly all tiers are empty
- [ ] Filtered-empty hint shows when lower priority emails exist but user dismissed unlock

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Existing users hit by default change | Medium | `FIRST_LOAD_KEY` and `PRIORITY_DEFAULT_FIX_KEY` already guard first-visit vs. returning user. New default only applies when no `STORAGE_KEY` exists in localStorage |
| Gate gets stuck (analysis hangs) | Low | Gate has escape hatch: `isGated = false` when `!isAnalysisRunning` regardless of count. SessionStorage dismissed flag. |
| Performance of new endpoint | Low | Simple COUNT query on indexed userId column. No joins. |
| `COALESCE(priorityScore, 0)` in existing queries | Info | NOT changing existing queries — just adding new count. Avoids regression risk. |

---

## Implementation Order

1. **Phase 1** (Backend) — Add unprioritised counts + new endpoint (smallest, no frontend risk)
2. **Phase 5** (Fix false inbox zero) — Fix progressive unlock chain (quick win, fixes #1434)
3. **Phase 4** (Default filter) — Change new-user default (simple, but needs Phase 3 for full effect)
4. **Phase 3** (Gate) — Interstitial + gate hook (depends on Phase 1 endpoint)
5. **Phase 2** (Virtual category) — "Analysing priority..." display (depends on Phase 1 response changes)
6. **Phase 6** (i18n) — Can be done incrementally with each phase

Estimated scope: ~500-700 lines of new/changed code across 10-12 files.
