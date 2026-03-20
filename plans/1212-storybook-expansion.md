# Plan: Expand Storybook — Split View + Comprehensive Component Coverage

**Issue:** #1212
**Branch:** `plan/1212-storybook-expansion`
**Author:** Monk of Modularity (AI agent)

---

## Background

BearlyMail's Storybook currently covers only 7 stories, all focused on the email-detail sidebar UI. The core inbox UI — especially the split view (left: category accordion + email list; right: email detail panel) — has **zero** Storybook coverage. Jeremy wants comprehensive Storybook coverage so the full product can be visually developed and verified in isolation.

---

## Component Inventory

### ✅ Stories That Exist

| Story file | What it covers |
|---|---|
| `ActionItemsSection.stories.tsx` | Inline action-items checklist (add/complete/delete) |
| `CollapsibleSection.stories.tsx` | Generic collapsible section wrapper |
| `EmailDetailActions.stories.tsx` | Reply/forward/archive/snooze/priority action bar |
| `EmailDetailContent.stories.tsx` | Full email detail panel (summary, actions, ICS, notes) |
| `PrivateNotesSection.stories.tsx` | Private notes collapsible |
| `ReplyComposerFooter.stories.tsx` | Reply composer send/schedule/keep-in-action footer |
| `SummarySection.stories.tsx` | AI summary collapsible |

All 7 are self-contained (no real imports, inline theme). Good pattern — continue it.

---

### ❌ Stories That Are Missing (Priority Order)

---

#### P0 — Split View (Issue #1212 Core Request)

**1. `InboxSplitView.stories.tsx`** — The full split-view layout
- Component surface: `InboxContent` + `SplitViewPanel` + `InboxEmailListPanel` (from `InboxContentParts.tsx`) + `ResizableDivider`
- This is a **composite story** that mocks the left panel (category list + email cards) and right panel (email detail) side by side
- Stories needed:
  - `NoEmailSelected` — left panel visible, right panel empty/placeholder
  - `EmailSelected` — left panel with highlighted email card, right panel showing email detail header + body (mocked)
  - `PanelExpanded` — right panel expanded to nearly full width (left panel compressed)
  - `Mobile` — single panel (left only), no right panel (simulated via `isMobile: true`)
  - `ResizingInProgress` — divider active, panels mid-resize (static snapshot)

**2. `SplitViewPanel.stories.tsx`** — Right panel in isolation
- Component: `client/src/components/inbox/SplitViewPanel.tsx`
- Sub-components: `SplitViewTitleBar`, `SplitViewActionButtons`, `SplitViewPriorityBar`, `SplitViewPanelHeader`
- Stories:
  - `Default` — email selected, all action buttons visible, priority bar shown
  - `SnoozeOpen` — snooze input expanded inline below header
  - `PrioritySelected` — one priority tier actively selected ("Oh sh$t")
  - `PanelExpanded` — full-width mode
  - `NoEmailMeta` — email ID present but no subject/sender resolved yet (loading)

**3. `ResizableDivider.stories.tsx`** — The draggable divider between panels
- Component: `client/src/components/inbox/ResizableDivider.tsx`
- Stories:
  - `Default` — centered (50/50 split)
  - `LeftHeavy` — 70/30
  - `RightHeavy` — 30/70

---

#### P1 — Category Accordion & Email List

**4. `CategoryAccordion.stories.tsx`**
- Component: `client/src/components/inbox/CategoryAccordion.tsx`
- Stories:
  - `Collapsed` — header only, count badge shown
  - `Expanded` — open with 3 email cards rendered as children
  - `Loading` — skeleton/spinner state while category emails are being fetched (`isLoadingContent: true`)
  - `Empty` — no emails in category (should show empty sub-state or nothing)
  - `OtherCategory` — "Other" category with re-analyse button
  - `ArchiveAllAvailable` — archive-all button visible (Action mode)

**5. `EmailCard.stories.tsx`**
- Component: `client/src/components/inbox/EmailCard.tsx`
- Stories:
  - `Default` — unread, low priority
  - `Read` — read email (no left border accent)
  - `Selected` — highlighted selected state
  - `HighPriority` — priority badge "High (85)"
  - `Urgent` — urgency badge visible
  - `UrgentEarlyDelivery` — warning ribbon (wasDeliveredEarly)
  - `WithLabels` — email labels shown

**6. `EmailCardHeader.stories.tsx`**
- Component: `client/src/components/inbox/email-card/EmailCardHeader.tsx`
- Stories:
  - `Default` — sender, timestamp, medium priority badge
  - `Processing` — spinner in priority badge
  - `HighPriority` / `LowPriority`
  - `WithLabels` — label chips shown

**7. `EmailListItem.stories.tsx`**
- Component: `client/src/components/inbox/EmailListItem.tsx`
- Stories:
  - `Default` — full email card with header + subject + preview
  - `Selected` — selected state
  - `WithFollowUpDraft` — draft section expanded (follow-up mode)
  - `AnimatingOut` — archive animation (opacity/slide transition)

**8. `ProtoCategorySubAccordion.stories.tsx`**
- Component: `client/src/components/inbox/ProtoCategorySubAccordion.tsx`
- Stories:
  - `Default` — with category name and 2 emails
  - `Empty` — no emails
  - `Deleting` — delete in progress

---

#### P2 — Inbox Header & Filters

**9. `InboxHeader.stories.tsx`**
- Component: `client/src/components/inbox/InboxHeader.tsx`
- Stories:
  - `TriageMode` — Triage tab active
  - `ActionMode` — Action tab active
  - `WithActiveFilters` — filter badge showing count
  - `Mobile` — hamburger/condensed layout

**10. `InboxFilters.stories.tsx`**
- Component: `client/src/components/inbox/InboxFilters.tsx`
- Stories:
  - `Collapsed` — filter bar hidden
  - `Expanded` — filter bar visible, all dropdowns shown
  - `WithActiveFilters` — account + category + priority filters applied
  - `Loading` — accounts/categories still loading

---

#### P3 — Email Detail Components

**11. `EmailDetailHeader.stories.tsx`**
- Component: `client/src/components/email-detail/EmailDetailHeader.tsx`
- Stories:
  - `Default` — sender, subject, timestamp, priority score
  - `WithThread` — thread participant count shown
  - `PriorityExplanationOpen` — breakdown popover visible
  - `HighPriority` / `LowPriority`

**12. `EmailThreadList.stories.tsx`**
- Component: `client/src/components/email-detail/EmailThreadList.tsx`
- Stories:
  - `SingleEmail` — no thread list (renders null, verify gracefully)
  - `TwoEmails` — thread with 2 items, both collapsed
  - `ThreadWithExpanded` — one thread item expanded showing body

**13. `EmailThreadItem.stories.tsx`**
- Component: `client/src/components/email-detail/EmailThreadItem.tsx`
- Stories:
  - `Collapsed` — collapsed thread item
  - `Expanded` — expanded with body

**14. `IcsInviteCard.stories.tsx`**
- Component: `client/src/components/email-detail/IcsInviteCard.tsx`
- Stories:
  - `Default` — invite with title, date, attendees
  - `AllDay` — all-day event
  - `ManyAttendees` — truncated attendee list (more than MAX_VISIBLE_ATTENDEES=5)
  - `Loading` — fetching ICS data
  - `AcceptedRSVP` / `DeclinedRSVP`

**15. `CalendarInviteActions.stories.tsx`**
- Component: `client/src/components/email-detail/CalendarInviteActions.tsx`
- Stories:
  - `Default` — accept/decline/maybe buttons
  - `Accepted` — accepted state
  - `Declined` — declined state

**16. `EmailAttachments.stories.tsx`**
- Component: `client/src/components/email-detail/EmailAttachments.tsx`
- Stories:
  - `NoAttachments` — renders nothing
  - `SingleAttachment`
  - `MultipleAttachments` — 3+ files, different MIME types

**17. `EmailPhishingWarning.stories.tsx`**
- Component: `client/src/components/email-detail/EmailPhishingWarning.tsx`
- Stories:
  - `HighConfidence` — PHISHING_CONFIDENCE_HIGH banner
  - `MediumConfidence` — PHISHING_CONFIDENCE_MEDIUM warning
  - `Dismissed` — warning dismissed

---

#### P4 — Inbox States & Overlays

**18. `InboxStates.stories.tsx`**
- Components: `client/src/components/inbox/states/` (AllCaughtUpState, EmptyState, ErrorState, LoadingState, ProgressiveUnlockPrompt)
- Stories:
  - `AllCaughtUp` — 🏆 trophy state
  - `Empty` — empty inbox
  - `Error` — fetch error with retry button
  - `Loading` — skeleton loading
  - `ProgressiveUnlockPrompt` — "load medium priority?" prompt

**19. `EmailListStates.stories.tsx`**
- Component: `client/src/components/inbox/EmailListStates.tsx`
- Stories:
  - `Loading`
  - `RefetchingWithData`
  - `Error`
  - `Empty`

**20. `BatchInfoBar.stories.tsx`**
- Component: `client/src/components/inbox/BatchInfoBar.tsx`
- Stories:
  - `Default` — next delivery time shown
  - `Urgent` — urgent check pending

---

#### P5 — Email Card Sub-Components

**21. `PriorityBadge.stories.tsx`**
- Component: `client/src/components/inbox/email-card/PriorityBadge.tsx`
- Stories: `High`, `Medium`, `Low`, `Processing`

**22. `UrgencyBadge.stories.tsx`**
- Component: `client/src/components/inbox/email-card/UrgencyBadge.tsx`
- Stories: `Urgent` (score >= threshold), `NotUrgent` (renders null)

**23. `EmailTimestamp.stories.tsx`**
- Component: `client/src/components/inbox/email-card/EmailTimestamp.tsx`
- Stories: `Recent`, `Yesterday`, `LastWeek`

**24. `EmailLabels.stories.tsx`**
- Component: `client/src/components/inbox/email-card/EmailLabels.tsx`
- Stories: `NoLabels`, `FewLabels`, `ManyLabels`

---

#### P6 — Action Items (Inline / email-detail-inline)

**25. `ActionCheckboxRow.stories.tsx`** — `email-detail-inline/ActionCheckboxRow.tsx`
- Stories: `Unchecked`, `Checked`, `Editing`

**26. `ActionItemInput.stories.tsx`** — `email-detail-inline/ActionItemInput.tsx`
- Stories: `Empty`, `WithText`, `Submitting`

**27. `ExpectedReplyRow.stories.tsx`** — `email-detail-inline/ExpectedReplyRow.tsx`
- Stories: `Default`, `OverdueReply`, `ReplyReceived`

---

#### P7 — Follow-Up Components

**28. `FollowUpDraft.stories.tsx`** — `client/src/components/inbox/FollowUpDraft.tsx`
- Stories: `Generating`, `Draft`, `Sent`, `Error`

**29. `FollowUpCard.stories.tsx`** — `client/src/components/inbox/FollowUpCard.tsx`
- Stories: `Default`, `Selected`, `Sending`

---

## Implementation Plan

### Story Authoring Convention

All stories should follow the **existing self-contained pattern**:
- Inline theme object (no real imports from `theme/theme`) — or import theme directly if it works cleanly in Storybook
- Inline mock data (no API calls, no Redux)
- Use `type StoryObj` from `@storybook/react`
- No `Router` / `AuthContext` / Redux `Provider` unless absolutely necessary — mock or stub those dependencies
- For complex stateful components (SplitViewPanel, InboxContent), build simplified versions of just the visual shell

### Recommended Authoring Order

| Sprint | Stories | Rationale |
|---|---|---|
| 1 | P0: InboxSplitView, SplitViewPanel, ResizableDivider | Issue #1212 core ask |
| 2 | P1: CategoryAccordion, EmailCard, EmailCardHeader, EmailListItem | Core inbox list |
| 3 | P2: InboxHeader, InboxFilters | Mode switching + filters |
| 4 | P3: EmailDetailHeader, IcsInviteCard, EmailThreadList, CalendarInviteActions, EmailAttachments, EmailPhishingWarning | Email detail surface |
| 5 | P4: InboxStates, EmailListStates, BatchInfoBar | Edge states |
| 6 | P5–P7: Badge components, action items, follow-up | Sub-components |

### Notes for Codebeard

1. **SplitView stories are composites.** `InboxSplitView.stories.tsx` should render a two-column flex layout directly (no hooks, no real API) with hardcoded email list on the left and hardcoded email detail on the right. Use Storybook `args` to switch states.
2. **SplitViewPanel depends on `EmailDetail` (a page).** For the story, replace the `<EmailDetail />` child with a `<MockEmailDetailPane />` stub that renders a realistic-looking but static email body. Do **not** import the real `EmailDetail` page in stories — it pulls in routing, auth, and API.
3. **CategoryAccordion uses `useTranslation`.** Wrap stories in `<I18nextProvider>` with a stub i18n instance, or replicate the i18n keys inline.
4. **Email type is large.** Create a `storyHelpers/mockEmail.ts` fixture factory that produces a valid `Email` object with sensible defaults and optional overrides.
5. **Theme imports** — the real `theme/theme` is importable in Storybook (Webpack alias `theme` is configured). Prefer importing it directly rather than duplicating the inline-Th pattern, unless it causes circular dep issues.
6. **Storybook viewport addon** — use `parameters.viewport` to define mobile/tablet viewports for responsive stories.

---

## Acceptance Criteria

- [ ] `InboxSplitView.stories.tsx` renders 5 states: NoEmailSelected, EmailSelected, PanelExpanded, Mobile, ResizingInProgress
- [ ] `SplitViewPanel.stories.tsx` renders 5 states
- [ ] `CategoryAccordion.stories.tsx` renders 6 states (collapsed, expanded, loading, empty, other, archive-all)
- [ ] All P1–P4 story files exist with at least 2 stories each
- [ ] All stories render without runtime errors in Storybook
- [ ] A `storyHelpers/mockEmail.ts` factory is created for shared mock data
- [ ] All new stories follow the self-contained pattern (no live API calls)
- [ ] CI passes (lint, TS compile, Storybook build)

---

*Filed by Monk of Modularity — AI agent. Human review required before implementation begins.*
