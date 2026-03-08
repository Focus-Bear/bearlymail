# Microbatch Refactoring Plan: `max-lines-per-function`

**Context:** ESLint rule `max-lines-per-function` (limit: 100 lines for components/hooks, 200 for pages) flags 98 files with 115+ violations. PR #738 tried to suppress them with `eslint-disable` comments — that approach was rejected. This plan organises actual refactoring into 14 manageable microbatches, ordered easiest → hardest.

**Enforcement:**
- Components/hooks: max 100 lines per function
- Pages: max 200 lines per function

---

## Summary Table

| Batch | Area | Files | Complexity |
|-------|------|-------|------------|
| 1 | Tiny overages (near-limit) | 9 | 🟢 Small |
| 2 | Simple hooks | 7 | 🟢 Small |
| 3 | Medium hooks | 6 | 🟡 Medium |
| 4 | Admin/Debug panels | 5 | 🟢 Small |
| 5 | Email delivery settings | 5 | 🟡 Medium |
| 6 | Auto-responder settings | 6 | 🟡 Medium |
| 7 | Guide-AI settings (simple) | 6 | 🟡 Medium |
| 8 | Guide-AI ProtoCategoriesModal | 1 | 🔴 Large |
| 9 | Email detail hooks | 5 | 🟡 Medium |
| 10 | Email detail inline components | 5 | 🟡 Medium |
| 11 | Inbox components (simple) | 8 | 🟡 Medium |
| 12 | CRM + Booking + Misc components | 9 | 🟡 Medium |
| 13 | Complex Inbox (SplitViewPanel, InboxContent) | 3 | 🔴 Large |
| 14 | Pages | 8 | 🔴 Large |

---

## Batch 1 — Tiny Overages: Near-Limit Files 🟢 Small

**Strategy:** These functions exceed the limit by 1–8 lines. The fix is usually extracting one small render helper, one utility function, or early-returning a loading state into a sub-component. Low risk.

| File | Function | Lines Over |
|------|----------|-----------|
| `hooks/useEmailDetailGithub.ts` | `useEmailDetailGithub` | 101 (1 over) |
| `components/settings/RecategorizeProgressBar.tsx` | arrow fn | 101 (1 over) |
| `components/settings/guide-ai/ContextSectionsList.tsx` | arrow fn | 101 (1 over) |
| `components/inbox/header/EmailHeaderRight.tsx` | arrow fn | 102 (2 over) |
| `hooks/useContactSearch.ts` | arrow fn | 102 (2 over) |
| `components/email-detail/EmailDetailDebugInfo.tsx` | `EmailDetailDebugInfo` | 103 (3 over) |
| `components/inbox/ResizableDivider.tsx` | arrow fn | 104 (4 over) |
| `components/booking/BookingForm.tsx` | arrow fn | 105 (5 over) |
| `components/scheduled-emails/ScheduledEmailsManager.tsx` | arrow fn | 105 (5 over) |

**Refactoring strategy:**
- Extract loading/error state blocks into named sub-components (e.g. `<LoadingState />`, `<ErrorState />`)
- Move large JSX render blocks (tables, lists, sections) to named helper components in the same file or a new `*Parts.tsx` file
- Extract utility functions (non-hook, non-JSX logic) to `utils/` if they don't need component context

**Risks:** Very low. These are minimal changes.

---

## Batch 2 — Simple Hooks (106–120 lines) 🟢 Small

**Strategy:** These hooks are modestly over the limit. Split by responsibility: state management vs. side effects vs. event handlers.

| File | Function | Lines |
|------|----------|-------|
| `hooks/useEmailDetailActionItems.ts` | `useEmailDetailActionItems` | 106 |
| `hooks/useFollowUps.ts` | arrow fn | 109 |
| `hooks/useBulkEmailActions.ts` | `useBulkEmailActions` | 116 |
| `hooks/useEmailActions.ts` | `useEmailActions` | 118 |
| `hooks/useEmailManagement.ts` | `useEmailManagement` | 118 |
| `hooks/useReplyDraftGeneration.ts` | arrow fn | 110 |
| `hooks/useEmailDetailOperations.ts` | async arrow at L664 | 110 |

**Refactoring strategy:**
- `useEmailDetailActionItems`: Extract the action builder logic into a pure helper function `buildActionItems()` outside the hook
- `useFollowUps`: Extract the follow-up data transform/filter logic into a `utils/followUpHelpers.ts`
- `useBulkEmailActions`: Split into `useBulkSelectionState` (selection tracking) + `useBulkActionHandlers` (mutation calls)
- `useEmailActions` / `useEmailManagement`: These likely share patterns — extract shared email mutation helpers to `utils/emailActionHelpers.ts`
- `useReplyDraftGeneration`: Extract the draft-generation API call into a standalone async helper
- `useEmailDetailOperations`: The async arrow at L664 (`handleSendReply`) is a single large handler — extract into a named `createSendReplyHandler()` factory or break the tone-check, send, and post-send steps into sub-functions

**Risks:** Low. Watch for hook call order: hooks extracted into sub-hooks must be called unconditionally.

---

## Batch 3 — Medium Hooks (120–145 lines) 🟡 Medium

**Strategy:** These hooks have grown large enough to warrant proper sub-hook extraction. Identify logical "phases" (initialise, fetch, update, cleanup) and split.

| File | Function | Lines |
|------|----------|-------|
| `hooks/useSearch.ts` | arrow fn | 111 |
| `hooks/useInboxCategoryAccordion.ts` | `useInboxCategoryAccordion` | 120 |
| `hooks/useDebugPanel.ts` | `useDebugPanel` | 127 |
| `hooks/useKeyboardShortcuts.ts` | `useKeyboardShortcuts` | 131 |
| `hooks/useSettingsData.ts` | `useSettingsData` | 135 |
| `hooks/useEmailActionsBase.ts` | `useEmailActionsBase` | 140 |

**Refactoring strategy:**
- `useSearch`: Extract debounce logic + query construction into a `useSearchQuery` sub-hook; results transformation into a helper
- `useInboxCategoryAccordion`: Separate accordion open/close state from category data loading
- `useDebugPanel`: Extract each debug data-fetch into individual `useDebug*Data()` hooks
- `useKeyboardShortcuts`: Group related shortcuts into handler maps; extract the `useEffect` registration into a `useShortcutRegistration(handlers)` sub-hook
- `useSettingsData`: Each settings section (email, scheduling, etc.) likely has independent fetches — split into `useEmailSettingsData`, `useSchedulingSettingsData`, etc.
- `useEmailActionsBase`: Extract mutation callbacks (archive, snooze, label) into a `useEmailMutations` sub-hook; keep state in the base hook

**Risks:** Medium. These hooks may be consumed in multiple places — search for all import sites before splitting the API surface.

---

## Batch 4 — Admin/Debug Panels 🟢 Small (low production risk)

**Strategy:** Admin/debug UI has no user-facing risk. Extract each "section" (panel, table, chart) into its own display sub-component.

| File | Function | Lines (each violation) |
|------|----------|----------------------|
| `components/admin/QueueDashboardSection.tsx` | arrow fn | 110 |
| `components/admin/JobsSection.tsx` | arrow fn | 125 |
| `components/admin/TokenUsagePanels.tsx` | arrow fn | 144 |
| `components/admin/ContextAnalysisSection.tsx` | two fns | 110, 205 |
| `components/admin/GitHubDebugPanels.tsx` | three fns | 133, 121, 162 |

**Refactoring strategy:**
- `GitHubDebugPanels.tsx` has 3 violations — each arrow fn is likely a panel; extract to `GitHubDebugPanel1`, `GitHubDebugPanel2`, `GitHubDebugPanel3` or semantically named equivalents
- `ContextAnalysisSection.tsx` — the 205-line fn is a large rendering section; extract `ContextAnalysisResults` as a sub-component
- `TokenUsagePanels.tsx` — extract chart/table rendering into a `TokenUsageChart` sub-component
- Keep sub-components in the same file or a co-located `*Parts.tsx` sibling

**Risks:** Low — admin UI, no user production impact.

---

## Batch 5 — Email Delivery Settings 🟡 Medium

**Strategy:** All 5 files are settings sections managing email account connections. They likely follow the same pattern: account list + add/remove actions + status indicators. Extract sub-components for account list rows, status badges, and action buttons.

| File | Function | Lines |
|------|----------|-------|
| `components/settings/email-delivery/EmailAccountsSection.tsx` | arrow fn | 141 |
| `components/settings/email-delivery/ZohoAccountsSection.tsx` | arrow fn | 154 |
| `components/settings/email-delivery/Office365AccountsSection.tsx` | arrow fn | 157 |
| `components/settings/email-delivery/ProviderSelectionModal.tsx` | arrow fn | 156 |
| `components/settings/email-delivery/BlockedKeywordsSection.tsx` | arrow fn | 181 |

**Refactoring strategy:**
- `EmailAccountsSection`, `ZohoAccountsSection`, `Office365AccountsSection` likely share an account list row pattern → extract a shared `AccountRow` / `AccountCard` component
- `ProviderSelectionModal` — extract the provider option cards into a `ProviderOptionCard` sub-component
- `BlockedKeywordsSection` (181 lines) — extract `BlockedKeywordsList` + `AddKeywordForm` sub-components
- Look for a shared `useAccountManagement(provider)` hook opportunity to DRY up the add/remove logic

**Risks:** Medium. These sections touch OAuth flows and account state. Ensure props flow correctly after extraction. Test add/remove flows.

---

## Batch 6 — Auto-Responder Settings 🟡 Medium

**Strategy:** These 6 files form a cohesive auto-responder settings feature. `TemplateEditorToolbar` and `AutoResponderTemplateEditor` are tightly coupled — handle together. Extract visual sections into sub-components.

| File | Function | Lines |
|------|----------|-------|
| `components/settings/auto-responder/AutoResponderExclusionSettings.tsx` | arrow fn | 107 |
| `components/settings/auto-responder/AutoResponderQASettings.tsx` | arrow fn | 121 |
| `components/settings/auto-responder/components/TemplateEditorToolbar.tsx` | arrow fn | 137 |
| `components/settings/auto-responder/AutoResponderTemplateEditor.tsx` | arrow fn | 127 |
| `components/settings/auto-responder/AutoResponderEmailPreview.tsx` | arrow fn | 138 |
| `components/settings/auto-responder/AutoResponderAnalytics.tsx` | arrow fn | 163 |

**Refactoring strategy:**
- `AutoResponderExclusionSettings` — likely a list + form; extract `ExclusionRuleList` + `AddExclusionForm`
- `AutoResponderQASettings` — extract Q&A pairs list into `QAPairList` sub-component
- `TemplateEditorToolbar` + `TemplateEditor` — the toolbar is already extracted; look for toolbar button groups that can become `FormattingButtons`, `InsertButtons` sub-components within the toolbar
- `AutoResponderEmailPreview` — extract the rendered email preview region into a `EmailPreviewPane` component
- `AutoResponderAnalytics` (163 lines) — extract individual metric cards/charts into named components

**Risks:** Medium. TemplateEditor ↔ Toolbar share state (cursor position, formatting). Verify state flows correctly after splitting.

---

## Batch 7 — Guide-AI Settings (Simple) 🟡 Medium

**Strategy:** These settings components configure the AI behaviour. Extract form field groups and rule list items.

| File | Function | Lines |
|------|----------|-------|
| `components/settings/guide-ai/SummarizationRuleEditForm.tsx` | arrow fn | 102 |
| `components/settings/guide-ai/ToneSettingsSection.tsx` | arrow fn | 124 |
| `components/settings/guide-ai/ProfileSettingsSection.tsx` | arrow fn | 129 |
| `components/settings/guide-ai/ToneRuleItem.tsx` | arrow fn | 148 |
| `components/settings/guide-ai/SummarizationRulesSection.tsx` | arrow fn | 152 |
| `components/settings/guide-ai/ContextSection.tsx` | two fns | 143, 110 |

**Refactoring strategy:**
- `SummarizationRuleEditForm` (barely over) — extract the form field block into a `RuleFormFields` sub-component
- `ToneRuleItem` — extract the edit/view toggle sections into `ToneRuleEditView` + `ToneRuleDisplayView`
- `SummarizationRulesSection` — extract the rules list into `SummarizationRulesList` + `AddRuleButton`
- `ProfileSettingsSection` / `ToneSettingsSection` — extract form field groups (basic info, advanced) as sub-components
- `ContextSection.tsx` has 2 violations — each violation is likely a separate inner component; give them explicit names and extract

**Risks:** Medium. AI settings often use React context; verify context consumption in sub-components.

---

## Batch 8 — Guide-AI ProtoCategoriesModal 🔴 Large

**Strategy:** This single file has **4 violations** — the most of any single file. It contains a custom hook (`useProtoCategories`) plus multiple render sections.

| File | Function | Lines |
|------|----------|-------|
| `components/settings/guide-ai/ProtoCategoriesModal.tsx` | `useProtoCategories` hook | 107 |
| | arrow fn at L156 | 138 |
| | arrow fn at L295 | 162 |
| | arrow fn at L311 | 145 |

**Refactoring strategy:**
1. **Extract `useProtoCategories`** into its own file: `hooks/useProtoCategories.ts` — it's already written as a hook
2. The three render arrow functions are likely: the modal body, a category list section, and a category edit form → extract as:
   - `ProtoCategoryList` — renders the list of categories
   - `ProtoCategoryEditForm` — the inline edit form
   - Keep the modal shell (`ProtoCategoriesModal`) thin (< 100 lines of routing between sub-components)
3. Move promotion-threshold logic into the hook

**Risks:** High within the file. Multiple internal components share state from `useProtoCategories`. Ensure the hook result is passed down as props correctly. Do not split state into multiple hooks unless clearly independent.

---

## Batch 9 — Email Detail Hooks 🟡 Medium

**Strategy:** These hooks power the email detail view. `useEmailDetailReplies` (189 lines) is the most complex. They share data (the email being viewed) — extract focused sub-hooks without breaking the shared data contract.

| File | Function | Lines |
|------|----------|-------|
| `hooks/useEmailDetailDraftOps.ts` | `useEmailDetailDraftOps` | 124 |
| `hooks/useEmailDetailInitialization.ts` | arrow fn | 124 |
| `hooks/useEmailDetailArchiveOps.ts` | `useEmailDetailArchiveOps` | 143 |
| `hooks/useEmailDetailReplies.ts` | `useEmailDetailReplies` | 189 |
| `components/email-detail-inline/useRecipients.ts` | arrow fn | 169 |

**Refactoring strategy:**
- `useEmailDetailDraftOps` — extract draft CRUD calls into a `useDraftPersistence(emailId)` sub-hook; keep state management in `useEmailDetailDraftOps`
- `useEmailDetailInitialization` — split into `useEmailDetailFetch(id)` (fetching) and `useEmailDetailSetup(email)` (derived state setup)
- `useEmailDetailArchiveOps` — extract post-archive navigation logic into a `usePostArchiveNavigation` helper
- `useEmailDetailReplies` (189 lines) — split into `useReplyState` (draft, attachments, scheduling state) + `useReplyActions` (send, save, discard); they communicate via a shared reply context or passed refs
- `useRecipients` (169 lines) — extract recipient search API calls into `useRecipientSearch` + keep the recipient list management in the main hook

**Risks:** Medium. Hooks are called within a parent hook chain — verify call order and conditional stability. Check for tests in `hooks/*.test.ts` and update them.

---

## Batch 10 — Email Detail Inline Components 🟡 Medium

**Strategy:** `ReplyComposer` and `ToneCheckResult` each have 2 violations — they contain multiple large inner components. Extract sub-components.

| File | Function | Lines |
|------|----------|-------|
| `components/email-detail/SchedulingRequestCard.tsx` | arrow fn | 112 |
| `components/email-detail/CalendarInviteActions.tsx` | arrow fn | 124 |
| `components/email-detail-inline/ToneCheckResult.tsx` | two fns | 154, 121 |
| `components/email-detail-inline/ReplyComposer.tsx` | two fns | 101, 181 |

**Refactoring strategy:**
- `SchedulingRequestCard` — extract time slot display into a `TimeSlotsList` component
- `CalendarInviteActions` — extract the action button group into `CalendarActionButtons`; the response form into `CalendarResponseForm`
- `ToneCheckResult` (2 violations, L41 + L218) — L41 is the main component (154 lines), L218 is an inner render fn; extract `ToneIssuesList` + `ToneCheckActions` sub-components
- `ReplyComposer` (2 violations, L91 + L202) — L91 likely the outer wrapper (101 lines), L202 an inner render; extract `ReplyComposerToolbar` + `ReplyComposerBody`

**Risks:** Medium. `ReplyComposer` is a core UI component. Test reply sending end-to-end after refactoring.

---

## Batch 11 — Inbox Components (Simple) 🟡 Medium

**Strategy:** These are the supporting inbox components (not the main InboxContent). Extract rendering blocks and handlers.

| File | Function | Lines |
|------|----------|-------|
| `components/inbox/BulkSendFollowUps.tsx` | arrow fn | 108 |
| `components/inbox/EmailActionsRow.tsx` | arrow fn | 121 |
| `components/inbox/BatchInfoBar.tsx` | arrow fn | 141 |
| `components/inbox/InboxFilters.tsx` | two fns | 107, 110 |
| `components/inbox/InboxHeader.tsx` | arrow fn | 153 |
| `components/inbox/Sidebar.tsx` | two fns | 109, 101 |
| `components/inbox/header/InboxHeaderActions.tsx` | arrow fn | 144 |
| `components/inbox/CategoryAccordion.tsx` | two fns | 128, 115 |

**Refactoring strategy:**
- `BulkSendFollowUps` — extract the email list within into `FollowUpEmailList`
- `EmailActionsRow` — extract action button groups (archive group, label group) into `ArchiveActions`, `LabelActions` sub-components
- `BatchInfoBar` — extract the batch progress display into `BatchProgressDisplay`
- `InboxFilters` (2 violations) — L46 is the main component; L269 is likely an inner section; extract `FilterChipGroup` + `FilterDropdownGroup`
- `InboxHeader` — extract search bar region into `InboxSearchBar`; actions into `InboxHeaderActions` (which already exists! — reuse/merge)
- `Sidebar` (2 violations) — extract the account section + navigation section into `SidebarAccounts` + `SidebarNav`
- `InboxHeaderActions` — extract icon button groups into smaller named button groups
- `CategoryAccordion` (2 violations at L140 + L269) — L140 is the main accordion (128 lines), L269 is an inner panel; extract `CategoryAccordionPanel` sub-component

**Risks:** Medium. Sidebar and Header are rendered on every inbox load. Test keyboard navigation and responsive behaviour.

---

## Batch 12 — CRM, Booking, Auth, Compose & Misc Components 🟡 Medium

**Strategy:** These components span multiple unrelated features but share similar patterns: forms with validation, modal dialogs, and display panels.

| File | Function | Lines |
|------|----------|-------|
| `components/crm/CRMDealsSection.tsx` | arrow fn | 122 |
| `components/crm/KanbanColumn.tsx` | arrow fn | 190 |
| `components/crm/DealFormModal.tsx` | two fns | 211, 145 |
| `components/booking/SlotSelection.tsx` | arrow fn | 152 |
| `components/auth/LoginFormSection.tsx` | arrow fn | 163 |
| `components/auth/PermissionsExplanation.tsx` | arrow fn | 129 |
| `components/setup-wizard/EmailImportStep.tsx` | arrow fn | 153 |
| `components/setup-wizard/WelcomeStep.tsx` | arrow fn | 113 |
| `components/compose/ComposeActions.tsx` | arrow fn | 116 |

**Refactoring strategy:**
- `KanbanColumn` (190 lines) — extract the card rendering loop into a `KanbanCard` sub-component (may already exist); extract drag-drop handlers into `useKanbanDragDrop`
- `DealFormModal` (2 violations, L38 + L382) — L38 is the main modal (211 lines), L382 an inner section; extract `DealFormFields` + `DealFormActions`
- `CRMDealsSection` — extract the deals table/list view into `DealsList`
- `SlotSelection` — extract individual time slot rows into `TimeSlotRow`
- `LoginFormSection` — extract the OAuth button group into `OAuthButtons`; form fields into `LoginFields`
- `PermissionsExplanation` — extract permission item rows into `PermissionItem`
- `EmailImportStep` — extract the email provider selection into `ProviderSelector`
- `WelcomeStep` — extract feature highlight cards into `FeatureCard`
- `ComposeActions` — extract formatting toolbar from send action buttons

**Risks:** Medium. Auth components are critical UX paths. Test login/OAuth flow after changes.

---

## Batch 13 — Complex Inbox Core (SplitViewPanel + InboxContent) 🔴 Large

**Strategy:** These are the heaviest inbox components. `InboxContent` has a 504-line arrow function — by far the largest single violation. Plan carefully before touching.

| File | Function | Lines |
|------|----------|-------|
| `components/inbox/useInboxContentData.ts` | `useInboxContentData` | 180 |
| `components/inbox/SplitViewPanel.tsx` | two fns | 252, 127 |
| `components/inbox/InboxContent.tsx` | two fns | 504, 166 |

**Refactoring strategy:**

**`useInboxContentData` (180 lines):**
- Extract email filtering/sorting logic into `utils/inboxDataHelpers.ts`
- Split into `useInboxEmails` (fetch + raw data) + `useInboxDisplayData` (derived: filtered, sorted, grouped)

**`SplitViewPanel` (252 lines at L56, 127 lines at L309):**
- The main component (L56) is the split layout manager; extract `SplitViewEmailList` (left pane) + `SplitViewDetail` (right pane)
- L309 is likely the detail pane itself — give it an explicit component name
- The resize logic should live in the existing `useResizable` hook or similar

**`InboxContent` (504 lines at L139, 166 lines at L497):**
This is the most complex refactor in the codebase. Recommended decomposition:
1. `InboxEmailList` — renders the flat list of emails (EmailListItem mapping)
2. `InboxCategoryView` — renders the CategoryAccordion-based view
3. `InboxTriageView` — renders the triage mode view with suggestions
4. `InboxFollowUpView` — renders follow-up mode
5. The outer `InboxContent` becomes a thin router selecting between these views based on `mode` prop
6. L497 (166 lines) is likely a sub-component already — name it and extract

**Risks:** 🔴 High. `InboxContent` is the core rendering engine of the app. Extract in small steps with manual testing at each step. Do NOT refactor hooks and components simultaneously in this area — do hooks (Batch 9/11) first.

**Pre-requisites:** Batches 9 and 11 should be merged before starting this batch.

---

## Batch 14 — Pages 🔴 Large

**Strategy:** Pages have a 200-line limit (more lenient). Extract large inner components and delegate state to hooks.

| File | Function | Lines | Over by |
|------|----------|-------|---------|
| `pages/privacy/PrivacyPolicyContentPart1.tsx` | arrow fn | 112 | 12 (uses 100-limit) |
| `pages/SetupPassword.tsx` | arrow fn | 202 | 2 |
| `pages/Stats.tsx` | arrow fn | 202 | 2 |
| `pages/BookingReschedulePage.tsx` | arrow fn | 213 | 13 |
| `pages/BookingCancelPage.tsx` | arrow fn | 235 | 35 |
| `pages/EmailDetail.tsx` | arrow fn | 221 | 21 |
| `pages/Contacts.tsx` | arrow fn | 258 | 58 |
| `pages/Deals.tsx` | arrow fn | 272 | 72 |
| `pages/Inbox.tsx` | arrow fn | 356 | 156 |
| `pages/ContactDetail.tsx` | arrow fn | 464 | 264 |
| `App.tsx` | arrow fn at L149 | 167 | 67 (uses 100-limit) |
| `pages/contact-detail/components/ContactActivityList.tsx` | arrow fn | 152 | 52 (uses 100-limit) |

**Refactoring strategy by file:**

- `PrivacyPolicyContentPart1` — extract static content blocks into sections; or split into `Part1A`, `Part1B`
- `SetupPassword` / `Stats` (barely over at 202) — extract 1 small section each
- `BookingReschedulePage` / `BookingCancelPage` — extract the confirmation UI into `BookingConfirmationCard`; booking details into `BookingDetails`
- `EmailDetail` (221) — should delegate most logic to `useEmailDetail*` hooks (many already exist); the page itself should just orchestrate
- `Contacts` (258) — extract `ContactsTable` + `ContactsSearch` + `ContactsFilter` sub-components; delegate data to `useContacts` hook
- `Deals` (272) — extract `DealsHeader` + `DealsKanbanBoard`; delegate to `useDeals` hook
- `Inbox` (356) — `Inbox.tsx` is likely already thin; check what the 356 lines are doing and extract layout orchestration into named sub-regions
- `ContactDetail` (464 — the largest page) — extract sections: `ContactHeader`, `ContactFields`, `ContactEmailHistory`, `ContactActivityPanel`; move field editing logic to `useContactDetailEdit` hook
- `App.tsx` (167 lines at L149) — the `AppRoutes` component or a protected route wrapper is likely oversized; extract `PrivateRoute`, `AdminRoute` into separate files in `components/auth/`
- `ContactActivityList` (152) — extract `ActivityListItem` sub-component

**Risks:** 🔴 High for `ContactDetail` and `Inbox`. These are heavily trafficked pages. Pre-requisite: all relevant hooks (Batches 2–9) and inbox components (Batches 11–13) should be done first for Inbox-related pages. CRM pages depend on Batch 12.

---

## General Refactoring Guidelines

1. **One batch per PR** — keep PRs focused and reviewable
2. **Sub-components first, hooks second** (unless the hook split unblocks multiple component refactors)
3. **Never add `eslint-disable` comments** — these were the reason PR #738 was rejected
4. **Co-locate small sub-components** — if a sub-component is only used in one file, keep it in the same file or a sibling `*Parts.tsx`
5. **Move large sub-components** to their own files in the same directory
6. **Verify with lint after each file**: `npx eslint src/<file> --ext .ts,.tsx`
7. **Run existing tests** after each batch: `cd client && npm test -- --watchAll=false`
8. **Hooks rules**: sub-hooks must be called unconditionally; never create a hook that's only sometimes called

## Dependency Order (Critical Path)

```
Batch 1 (quick wins) — independent
Batch 2-3 (simple/medium hooks) — independent
Batch 4 (admin) — independent
Batch 5-7 (settings) — independent
Batch 8 (ProtoCategoriesModal) — independent
Batch 9 (email detail hooks) ──────┐
Batch 10 (email detail components) ┤
Batch 11 (inbox components) ───────┤── Batch 13 (InboxContent) ── Batch 14 (pages/Inbox)
Batch 12 (CRM/misc) ───────────────┘
```
