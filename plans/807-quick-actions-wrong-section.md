# Plan: #807 — Suggested quick actions rendering in wrong spot

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/807

---

## Problem Analysis

Suggested quick actions (from the LLM `detectSuggestedActions` call) are pre-populating the wrong section in the email detail view. Instead of appearing in the `QuickActionsSection` (rendered via `QuickActionsSection.tsx` with the `QuickActionsButton`), they appear somewhere else — possibly pre-filling the reply draft, the action items list, or another section.

---

## Root Cause Hypothesis

Looking at the email detail flow:

1. `useEmailDetailOperations.ts` calls `setSuggestedActions(actions)` when the LLM returns suggested actions.
2. `suggestedActions` is passed to multiple components — both `EmailDetailActions` (which renders `QuickActionsSection`) AND potentially other hooks.

The likely bug: `selectedAction` (the action chosen from the quick actions menu) is being set prematurely or incorrectly — possibly because:

**Option A:** The `suggestedActions` array is being passed somewhere other than `QuickActionsSection`. Check if any hook or component subscribes to `suggestedActions` and auto-applies the first action without user interaction.

**Option B:** The `selectedAction` state is being auto-set to the first suggested action rather than requiring the user to explicitly select it. If `setSelectedAction(actions[0])` is called when actions load, the action modal/form for the first action would auto-open, rendering in the wrong place.

**Option C:** One of the action types (e.g., `calendar_create_invite` or `github_create_issue`) auto-populates the reply composer draft with its pre-filled text, which the user sees as "rendering in the wrong section".

**Option D:** The reply draft suggestion (from `useEmailDetailDraftOps.ts`) is somehow merged with or confused with quick action suggestions.

---

## Investigation Steps

Before implementing a fix, determine which option is occurring:

1. Check `useEmailDetailOperations.ts` around where `setSuggestedActions` is called:

   ```typescript
   // Is setSelectedAction being called alongside setSuggestedActions?
   setSuggestedActions(actions);
   // Should NOT be here:
   // setSelectedAction(actions[0]);
   ```

2. Check if any `useEffect` watches `suggestedActions` and auto-selects an action.

3. Check `useEmailDetailDraftOps.ts` — does it use `suggestedActions` to pre-fill the draft?

4. Check `EmailDetailActions.tsx` — is `hasSchedulingRequest` correctly guarding the `SchedulingRequestCard`, or is the card rendering when it shouldn't?

---

## Implementation Steps

### If Option A/B (auto-selection of action):

**File:** `client/src/hooks/useEmailDetailOperations.ts`

- Audit all places where `setSelectedAction` is called.
- Ensure `selectedAction` is only ever set via explicit user interaction (clicking a quick action from the menu), never automatically.
- Remove any `setSelectedAction(actions[0])` or auto-open logic.

### If Option C (action pre-populating reply draft):

**File:** `client/src/hooks/useEmailDetailDraftOps.ts`

- Ensure draft reply suggestions come only from the reply draft LLM call, NOT from the quick actions LLM call.
- The two should be independent: quick actions → `setSuggestedActions`; draft → `setReplyOptions`.

### If Option D (draft/action confusion):

**File:** `client/src/hooks/useEmailDetailOperations.ts`

- Audit the two separate LLM calls (draft suggestions and quick actions) — verify they write to separate state variables and don't interfere.

### General fix — add explicit guard in QuickActionsSection:

**File:** `client/src/components/email-detail/QuickActionsSection.tsx`

- Ensure the modals (`GitHubCreateIssueModal`, `CalendarCreateInviteModal`, etc.) only render when `selectedAction` is explicitly set by user click.
- Double-check that `selectedAction !== null` is always the result of `onSelectAction(action)` in the `QuickActionsMenu`.

---

## Files to Modify

| File                                                         | Change                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `client/src/hooks/useEmailDetailOperations.ts`               | Audit and remove any auto-selection of suggested actions            |
| `client/src/hooks/useEmailDetailDraftOps.ts`                 | Verify draft and quick actions are separate state flows             |
| `client/src/components/email-detail/QuickActionsSection.tsx` | Add defensive checks; ensure modals only open on explicit selection |
| `client/src/components/email-detail/EmailDetailActions.tsx`  | Verify `hasSchedulingRequest` guard is working correctly            |

---

## Testing Approach

1. **Reproduce the bug:**
   - Open an email that has suggested quick actions (e.g., a GitHub PR email with `github_update_status` suggested).
   - Note where the pre-populated content appears.
   - Confirm it's NOT in the Quick Actions section.

2. **After fix:**
   - Same email: verify no auto-population occurs.
   - Click the Quick Actions button (🎯 or similar) — verify the menu appears.
   - Select an action — verify the correct modal/form opens.
   - Verify the reply draft section is NOT pre-populated with action content.

3. **Unit test:**
   - `useEmailDetailOperations`: after `detectSuggestedActions` resolves, assert `selectedAction === null`.
   - Quick actions menu: clicking an action calls `onSelectAction` with the correct action.

---

## Notes

- This is a regression — quick actions existed before and worked. Check recent commits for what changed.
- PostHog events for `QUICK_ACTION_SELECTED` (or similar) may help identify if the action is being auto-triggered.
- If the issue is specifically about `scheduling_request` showing the `SchedulingRequestCard` in the wrong spot, that's guarded by `hasSchedulingRequest` — check if that flag is being set too eagerly.
