# Plan: Issue #1433 — New User Onboarding: Gate Inbox Until Emails Prioritised

**Issue:** [#1433](https://github.com/Focus-Bear/BearlyMail/issues/1433)
**Author:** Monk of Modularity (AI agent)
**Date:** 2026-03-24

---

## Problem Summary

After completing the setup wizard (onboarding), new users land on the inbox and see:
1. **"No new emails to triage! You're all caught up"** — because the default priority filter is `Very High (>50)` and no emails have been prioritised yet (all have `priorityScore = null` → `COALESCE(priorityScore, 0) = 0`).
2. **Emails appear in "Other" category** with 🔄 Calculating... badges on each email's PriorityBadge — confusing since "Other" implies low importance when really priority just hasn't been calculated yet.
3. **Default filter hides everything** — `loadInitialFilters()` in `useInboxFilters.ts` defaults to `minPriority: 50` for first-time users, filtering out all unprioritised emails.

## Root Cause Analysis

### Default Filter (Priority >50)
- **File:** `client/src/hooks/useInboxFilters.ts` (lines 131–139)
- `loadInitialFilters()` returns `{ minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null }` (i.e., score > 50) for new users with no `localStorage` data.
- Since new emails arrive with `priorityScore = null` (or 0 after COALESCE), they're all filtered out.

### "Other" Category for Unprioritised Emails
- **File:** `server/src/emails/email-inbox.service.ts` (lines 298–307)
- `countRowsByCategory()` assigns `OTHER_CATEGORY_NAME` to threads with `categoryId = null`.
- New emails haven't been through LLM analysis yet, so `categoryId` is null → they all land in "Other".
- **File:** `client/src/components/inbox/CategoryAccordion.tsx` — "Other" shows the 🔄 reanalyse button but nothing explains these emails are *pending* analysis.

### No Inbox-Level Gate for Prioritisation
- The setup wizard has an `EmailImportStep` that gates on `isReady` (from `GET /onboarding/email-import-progress`), but this only checks email *import* count and context analysis completion — not whether emails have been *prioritised*.
- After onboarding completes (`hasCompletedOnboarding = true`), the inbox loads immediately with no awareness of prioritisation progress.
- **File:** `server/src/onboarding/onboarding.service.ts` — `getEmailImportProgress()` checks total email count and context analysis status, but NOT prioritisation status (`priorityScore IS NOT NULL`).

### Individual "Calculating..." Badge
- **File:** `client/src/components/inbox/email-card/PriorityBadge.tsx` — Shows spinner + "Calculating..." when `isProcessingPriority = true`, but this is per-email and doesn't give users a sense of overall progress.
- **File:** `server/src/database/entities/email-thread.entity.ts` — `isProcessingPriority` boolean flag on each thread.

---

## Implementation Plan

### Change 1: Fix Default Filter for New Users

**Goal:** New users see ALL their emails, not just "Very High" priority.

**Files to modify:**
- `client/src/hooks/useInboxFilters.ts`

**Changes:**
1. In `loadInitialFilters()`, change the first-visit default from `minPriority: VERY_HIGH_PRIORITY_THRESHOLD` to `minPriority: null, maxPriority: null` (show all):
   ```typescript
   // Line ~138: Change from:
   return { accountIds: [], categories: [], minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null };
   // To:
   return { accountIds: [], categories: [], minPriority: null, maxPriority: null };
   ```
2. Add a new one-time migration key (e.g., `PRIORITY_DEFAULT_FIX_V3_KEY = 'inbox_priority_default_v3_done'`) to reset existing new users who got the old default but have no prioritised emails yet. This handles users who signed up between now and this fix deploying.
3. Update the `PRIORITY_DEFAULT_FIX_KEY` migration block (lines 112–129) to include the new migration.

**Tests to update:**
- `client/src/hooks/useInboxFilters.test.ts` — Update test expectations for initial filter state.

---

### Change 2: Add "Analysing priority..." Category

**Goal:** Replace "Other" for unprioritised emails with a visually distinct "Analysing priority..." category that has an inline spinner.

#### Server-side

**Files to modify:**
- `server/src/emails/email-inbox.service.ts`

**Changes:**
1. In `countRowsByCategory()`, split the `OTHER_CATEGORY_NAME` bucket into two:
   - **"Analysing priority..."** — threads where `priorityScore IS NULL AND isProcessingPriority = true` (or where `priorityExplanation IS NULL` as a broader check).
   - **"Other"** — threads where `categoryId IS NULL AND priorityScore IS NOT NULL` (genuinely uncategorised after analysis).
2. Update the SQL in `getInboxSummary()` to include `thread."priorityScore"` and `thread."isProcessingPriority"` in the SELECT so `countRowsByCategory` can distinguish them.
3. Expose a new constant `ANALYSING_PRIORITY_CATEGORY = 'Analysing priority...'` in `server/src/constants/email-labels.ts` (or appropriate constants file).

**Files to modify:**
- `server/src/emails/email-inbox.service.ts` — `countRowsByCategory()` and `getInboxSummary()` SQL.
- `server/src/constants/email-labels.ts` (new constant).

#### Client-side

**Files to modify:**
- `client/src/constants/strings.ts` — Add `CATEGORY_ANALYSING_PRIORITY = 'Analysing priority...'`.
- `client/src/components/inbox/CategoryAccordion.tsx` — Add spinner rendering for the "Analysing priority..." category header (similar to how `ReanalyseButton` shows a spinner, but inline in the category name).
- `client/src/components/inbox/categoryAccordion.helpers.ts` — Add icon mapping for the new category (e.g., ⏳ or 🔄).
- `client/src/components/inbox/CategorySection.tsx` — Handle the new category name (it should NOT show "Archive All" or "Reanalyse" buttons).
- `client/src/components/inbox/inboxCategoryHelpers.ts` — Update `buildOtherProtoGroups()` to exclude emails in the "Analysing priority..." bucket.

**Behaviour:**
- The "Analysing priority..." category has an animated spinner in its header.
- It automatically disappears when all emails in it get prioritised (their `priorityScore` becomes non-null → they move to their real category on next fetch).
- No "Archive All" or "Reanalyse" actions on this category.
- Sorted LAST in category order (lowest priority display position).

---

### Change 3: Gate Inbox Until ≥20 Emails Are Prioritised

**Goal:** Show a loading/progress screen when a new user first enters the inbox, until enough emails have priority scores.

#### Server-side

**Files to modify:**
- `server/src/onboarding/onboarding.service.ts`
- `server/src/onboarding/onboarding.controller.ts`

**Changes:**
1. Add a new endpoint `GET /onboarding/prioritisation-progress` (or extend `email-import-progress`):
   ```typescript
   async getPrioritisationProgress(userId: string): Promise<{
     prioritisedCount: number;
     totalCount: number;
     isReady: boolean;
   }> {
     const prioritisedCount = await this.emailThreadRepository.count({
       where: { userId, priorityScore: Not(IsNull()) },
     });
     const totalCount = await this.emailThreadRepository.count({
       where: { userId, isArchived: false },
     });
     const isReady = prioritisedCount >= 20 || totalCount <= 20;
     return { prioritisedCount, totalCount, isReady };
   }
   ```
2. Register the new endpoint in `OnboardingController` with `@SkipThrottle()` (it will be polled).

**Alternative (recommended):** Extend the existing `getEmailImportProgress()` to also return `prioritisedCount` and a separate `isPrioritisationReady` flag. This avoids adding a new endpoint and keeps the existing polling infrastructure.

**Extended approach:**
```typescript
async getEmailImportProgress(userId: string): Promise<{
  prioritizedCount: number;   // total emails (existing)
  isReady: boolean;           // import ready (existing)
  prioritisedCount: number;   // NEW: emails with priorityScore != null
  totalInboxCount: number;    // NEW: total non-archived threads  
  isPrioritisationReady: boolean; // NEW: >= 20 prioritised OR total <= 20
}> {
  // ... existing logic ...
  
  const prioritisedCount = await this.emailThreadRepository.count({
    where: { userId, priorityScore: Not(IsNull()), isArchived: false },
  });
  const totalInboxCount = await this.emailThreadRepository.count({
    where: { userId, isArchived: false },
  });
  const isPrioritisationReady = prioritisedCount >= 20 || totalInboxCount <= 20;
  
  return { ...existingResult, prioritisedCount, totalInboxCount, isPrioritisationReady };
}
```

#### Client-side

**Files to create:**
- `client/src/components/inbox/states/PrioritisationGate.tsx` — New component showing the gating screen.

**Files to modify:**
- `client/src/hooks/useInboxInitialization.ts` — Add prioritisation progress polling for users who recently completed onboarding.
- `client/src/components/inbox/InboxContent.tsx` or `client/src/components/inbox/InboxContentParts.tsx` — Render `PrioritisationGate` when prioritisation is not ready.
- `client/src/hooks/useInboxState.ts` — Expose prioritisation readiness state.

**PrioritisationGate Component Design:**
```
┌─────────────────────────────────────────┐
│                                         │
│     🐻 Setting up your inbox...         │
│                                         │
│     Analysing your emails               │
│     (12/156 prioritised)                │
│                                         │
│     [████████░░░░░░░░░░░░] 7%           │
│                                         │
│     This usually takes a minute or two  │
│                                         │
└─────────────────────────────────────────┘
```

**Behaviour:**
- Only shown when `hasCompletedOnboarding` is recent (within last 30 minutes, tracked via localStorage timestamp) AND `isPrioritisationReady === false`.
- Polls `GET /onboarding/email-import-progress` (extended) every 3 seconds.
- Progress bar shows `prioritisedCount / totalInboxCount`.
- When `isPrioritisationReady` becomes true, the gate dissolves and the inbox renders normally.
- Safety valve: if gate hasn't cleared after 3 minutes, show "Skip" button (similar to `EmailImportStep`'s 5-minute timeout).
- Stores `onboarding_prioritisation_seen` in localStorage so returning users never see the gate again.

---

### Change 4: i18n Translations

**Files to modify:**
- `client/public/locales/en/translation.json` (and other locale files)

**New keys:**
```json
{
  "inbox.prioritisationGate.title": "Setting up your inbox...",
  "inbox.prioritisationGate.subtitle": "Analysing your emails",
  "inbox.prioritisationGate.progress": "({{current}}/{{total}} prioritised)",
  "inbox.prioritisationGate.hint": "This usually takes a minute or two",
  "inbox.prioritisationGate.skip": "Skip",
  "inbox.category.analysingPriority": "Analysing priority..."
}
```

---

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `client/src/hooks/useInboxFilters.ts` | Modify | Default filter to "All" for new users |
| `client/src/hooks/useInboxFilters.test.ts` | Modify | Update test expectations |
| `server/src/emails/email-inbox.service.ts` | Modify | Split "Other" into "Analysing priority..." + "Other" in `countRowsByCategory()` and summary SQL |
| `server/src/onboarding/onboarding.service.ts` | Modify | Extend `getEmailImportProgress()` with prioritisation counts |
| `server/src/onboarding/onboarding.controller.ts` | Modify | (No change if extending existing endpoint) |
| `client/src/components/inbox/states/PrioritisationGate.tsx` | **Create** | New gating screen component |
| `client/src/hooks/useInboxInitialization.ts` | Modify | Add prioritisation polling logic |
| `client/src/hooks/useInboxState.ts` | Modify | Expose prioritisation readiness |
| `client/src/components/inbox/InboxContentParts.tsx` | Modify | Render PrioritisationGate |
| `client/src/components/inbox/CategoryAccordion.tsx` | Modify | Spinner for "Analysing priority..." header |
| `client/src/components/inbox/categoryAccordion.helpers.ts` | Modify | Icon + translation key for new category |
| `client/src/components/inbox/CategorySection.tsx` | Modify | Hide actions for "Analysing priority..." category |
| `client/src/components/inbox/inboxCategoryHelpers.ts` | Modify | Exclude from "Other" proto group logic |
| `client/src/constants/strings.ts` | Modify | Add `CATEGORY_ANALYSING_PRIORITY` constant |
| `server/src/constants/email-labels.ts` | Modify | Add server-side constant |
| `client/public/locales/en/translation.json` | Modify | Add i18n keys |

---

## Implementation Order

1. **Change 1 (Default filter)** — Smallest, most impactful, fixes the immediate "empty inbox" problem. Ship first.
2. **Change 3 (Prioritisation gate)** — Server endpoint extension + new client component. Second priority.
3. **Change 2 ("Analysing priority..." category)** — Requires coordinated server + client changes. Third.
4. **Change 4 (i18n)** — Done alongside each change.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Changing default filter affects existing users | One-time migration key ensures only truly new users (no localStorage) get new default. Existing users are unaffected. |
| Polling endpoint adds server load | `@SkipThrottle()` + 3-second interval is modest. Gate only shows for ~1–3 minutes per new user. |
| "Analysing priority..." category name collision | Use a constant that's unlikely to match user-created categories. Server-side constant ensures consistency. |
| Race condition: emails prioritised between polls | No functional issue — gate clears on next poll. Category regroups on next inbox fetch. |
| Gate blocks users indefinitely if priority queue stalls | 3-minute safety valve with "Skip" button. `localStorage` flag prevents repeat gating. |

---

## Testing Strategy

1. **Unit tests:** Update `useInboxFilters.test.ts` for new default. Add tests for `PrioritisationGate` component.
2. **Integration tests:** Test `getEmailImportProgress()` extended response shape. Test `countRowsByCategory()` splitting logic.
3. **Manual QA:** Create new user account, verify: (a) setup wizard works, (b) prioritisation gate appears, (c) gate clears after ~20 emails prioritised, (d) inbox shows "Analysing priority..." category for remaining unprioritised emails, (e) default filter is "All".
