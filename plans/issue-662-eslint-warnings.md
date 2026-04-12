# Plan: Fix 93 Remaining ESLint Warnings (Issue #662)

## Problem Statement

The BearlyMail client has **93 ESLint warnings (0 errors)** as of 2026-03-04:

| Rule                     | Count | Description                                     |
| ------------------------ | ----- | ----------------------------------------------- |
| `max-lines-per-function` | 85    | Functions/components exceeding line limits      |
| `no-restricted-syntax`   | 6     | Magic strings / inline colour literals          |
| `max-statements`         | 3     | Functions with too many statements              |
| `complexity`             | 2     | Functions exceeding cyclomatic complexity limit |

> Note: `complexity` warnings showed up in the lint run (2 violations in `EmailDetailContent.tsx`) even though they're counted within the 93 total — they are addressed in Batch 6.

---

## Strategy

Each batch is a standalone PR by Codebeard. Batches are ordered from quickest-win to most involved. Each batch must leave `npm run lint` with fewer warnings than before it.

**Refactoring approaches used throughout:**

- **Hook extraction**: Move `useState` + `useCallback` + `useEffect` clusters into a new `hooks/useXxx.ts` file
- **Sub-component extraction**: Move JSX blocks that render independent UI sections into new sibling component files
- **Helper extraction**: Move pure functions (formatters, style calculators, config builders) above or outside the component, or into a `utils/` file
- **Constants extraction**: Replace magic string literals with named exports from `constants/strings.ts` or `constants/colors.ts`

---

## Batch 1 — Magic Strings & Colour Constants (Quick Win)

**Estimated warnings fixed: 6**
**Files: 1**

### File: `src/components/admin/ContextAnalysisSection.tsx`

#### Violations

| Line   | Rule                   | Value                                |
| ------ | ---------------------- | ------------------------------------ |
| 123:12 | `no-restricted-syntax` | `'rate_limit'` in switch case        |
| 125:12 | `no-restricted-syntax` | `'timeout'` in switch case           |
| 127:12 | `no-restricted-syntax` | `'token_limit'` in switch case       |
| 129:12 | `no-restricted-syntax` | `'parse_error'` in switch case       |
| 131:12 | `no-restricted-syntax` | `'network_error'` in switch case     |
| 431:44 | `no-restricted-syntax` | inline colour `'#fff'` in style prop |

#### Fix

**Step 1**: Add to `src/constants/strings.ts`:

```ts
// Error type keys for context analysis
export const ERROR_TYPE_RATE_LIMIT = "rate_limit" as const;
export const ERROR_TYPE_TIMEOUT = "timeout" as const;
export const ERROR_TYPE_TOKEN_LIMIT = "token_limit" as const;
export const ERROR_TYPE_PARSE_ERROR = "parse_error" as const;
export const ERROR_TYPE_NETWORK_ERROR = "network_error" as const;
```

**Step 2**: In `ContextAnalysisSection.tsx`, import the new constants and the existing `COLOR_WHITE` from `constants/colors.ts`:

```ts
import {
  ERROR_TYPE_NETWORK_ERROR,
  ERROR_TYPE_PARSE_ERROR,
  ERROR_TYPE_RATE_LIMIT,
  ERROR_TYPE_TIMEOUT,
  ERROR_TYPE_TOKEN_LIMIT,
} from "constants/strings";
import { COLOR_WHITE } from "constants/colors";
```

**Step 3**: Replace the `getErrorTypeColor` switch cases (lines ~123–131):

```ts
case ERROR_TYPE_RATE_LIMIT:    return theme.colors.accent.error;
case ERROR_TYPE_TIMEOUT:       return theme.colors.accent.warning;
case ERROR_TYPE_TOKEN_LIMIT:   return theme.colors.accent.warning;
case ERROR_TYPE_PARSE_ERROR:   return theme.colors.accent.info;
case ERROR_TYPE_NETWORK_ERROR: return theme.colors.accent.error;
```

**Step 4**: Replace inline colour at line ~431:

```tsx
color: COLOR_WHITE,   // was: color: '#fff'
```

#### Verify

```bash
cd client && npm run lint 2>&1 | grep "ContextAnalysisSection" | grep "no-restricted-syntax"
# Should return no output (0 warnings)
```

---

## Batch 2 — max-statements & complexity Violations

**Estimated warnings fixed: 5** (3 max-statements + 2 complexity)
**Files: 4**

### File: `src/pages/EmailDetail.tsx` — line 73:66 (48 statements)

The `EmailDetail` component already has an `// eslint-disable-next-line` comment acknowledging its size. The component relies on `useEmailDetailState` and `useEmailDetailOperations`. The `max-statements` warning is on the `forwardRef` callback starting at line 73.

**Approach**: Extract a `useEmailDetailTimePicker` hook for the time-picker local state + handlers:

```ts
// new file: src/hooks/useEmailDetailTimePicker.ts
// Moves: showTimePicker, scheduledSendAt, timeWarning, suggestedTime states
// and the handlers that update them
// Returns: { showTimePicker, setShowTimePicker, scheduledSendAt, setScheduledSendAt,
//            timeWarning, suggestedTime, handleTimeSelected, handleSendTimeCheck }
```

This reduces the statement count in the `EmailDetail` forwardRef callback by ~6–8 statements.

Also extract a `getEmailDetailContainerStyle` pure helper function (already exists above the component — confirm it's not inside the component body). If the style-building logic is inside the component, move it out.

### File: `src/pages/ContactDetail.tsx` — line 150:37 (38 statements, 313 lines)

`ContactDetailPage` component starts at line 150. It has multiple `useState` declarations + async handlers.

**Approach**: Extract a `useContactDetailData` hook:

```ts
// new file: src/hooks/useContactDetailData.ts
// Moves: contact, contactTypes, loading, error states
// Moves: fetchContact, fetchContactTypes, fetchCustomFieldDefs callbacks
// Moves: handleUpdateField, handleAddNote, handleDeleteNote,
//        handleSetCustomFieldValue, handleAddCustomField handlers
// Returns all state + handlers
```

This reduces the component body from ~38 statements to ~15.

### File: `src/hooks/useEmailFetching.ts` — line 156:35 (41 statements, async)

The `fetchEmails` callback at line ~156 handles both `MODE_AUTORESPONDED` and normal inbox fetch paths, plus error handling.

**Approach**: Extract two helper functions inside or above `useEmailFetching`:

```ts
// Extract: async function fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary)
// Extract: async function fetchInboxSummary(dispatch, buildSummaryParams)
// fetchEmails then calls one of these two, reducing its own statement count
```

Both helpers can be defined at module scope (outside the hook) since they receive dispatch as a parameter.

### File: `src/components/email-detail-inline/EmailDetailContent.tsx` — lines 50:147 (complexity 34) and 147:70 (complexity 28)

Two arrow functions with high cyclomatic complexity due to many conditional branches.

**Approach**:

- Line 50 function: identify the branching chains (likely rendering logic with many `if`/ternary checks). Extract separate `renderXxx` helper components for each logical section.
- Line 147 function: similar approach — look for guard clauses and early returns that can be consolidated.
- If the functions are event handlers with many `if` branches, extract sub-handlers per case.

> Codebeard: run `sed -n '45,200p' src/components/email-detail-inline/EmailDetailContent.tsx` to inspect the exact branching structure before refactoring.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "(EmailDetail\.tsx|ContactDetail\.tsx|useEmailFetching|EmailDetailContent)" | grep -E "(max-statements|complexity)"
# Should return no output
```

---

## Batch 3 — Page-Level Components (pages/)

**Estimated warnings fixed: 9**
**Files: 7**

### `src/pages/Contacts.tsx` — line 19:28 (425-line arrow function)

The `Contacts` component is a monolith: it owns data fetching, sync, search, and all rendering.

**Approach**:

1. Extract `useContactsData` hook (`src/hooks/useContactsData.ts`):
   - Owns: `contacts`, `contactTypes`, `loading`, `syncing`, `error` state
   - Owns: `fetchContacts`, `fetchContactTypes`, `handleSync` callbacks
   - Returns all the above
2. Extract `useContactSearch` hook (`src/hooks/useContactSearch.ts`):
   - Owns: `searchQuery`, `searchResults`, `searching`, `searchTimeoutRef`
   - Owns: the debounced search `useEffect` + `handleSearchChange`
   - Returns: `searchQuery`, `searchResults`, `searching`, `handleSearchChange`
3. The `Contacts` component then only owns layout/rendering: ~80 lines remaining.

### `src/pages/Inbox.tsx` — line 23:25 (345-line arrow function)

`Inbox` is already heavily decomposed into hooks and sub-components. The remaining size is primarily JSX wiring.

**Approach**:

1. Extract `InboxPageLayout` component (`src/components/inbox/InboxPageLayout.tsx`):
   - Renders the outer layout div + `Sidebar` + main content area wrapper
   - Receives layout props (isCollapsed, isMobileMenuOpen, etc.)
2. The large section of `return (...)` JSX can be split into a `renderInboxBody` inline function or further sub-components where logical grouping exists.

> Codebeard: run `sed -n '23,370p' src/pages/Inbox.tsx` to identify the largest contiguous JSX blocks to extract.

### `src/pages/Stats.tsx` — line 207:25 (268-line arrow function)

The `Stats` component (starts at line 207) renders stats cards, charts, and category rows.

**Approach**:

1. Extract `useStatsPage` hook:
   - Owns: `days` state, `stats`/`loading`/`error`/`refetch` from `useEmailStats`
   - Owns: sidebar state, responsive state
   - Returns all of the above
2. Extract `StatsContent` component (`src/components/stats/StatsContent.tsx`):
   - Receives `stats`, `days`, `setDays`, `t` as props
   - Renders the stats body (cards + chart + category list)
3. `Stats` page then just calls the hook + renders `<Sidebar>` + `<StatsContent>`.

### `src/pages/Search.tsx` — line 29:26 (255-line arrow function)

**Approach**:

1. Move `getPriorityBadge`, `getScoreBackgroundColor`, `getScoreColor` pure helpers above the `Search` component (they don't use hooks, so they can be module-level functions).
2. Extract `ScoreBreakdownModal` component (`src/components/search/ScoreBreakdownModal.tsx`) for the debug breakdown modal JSX.
3. These two extractions should bring the function under 200 lines.

### `src/pages/Login.tsx` — line 17:25 (211-line arrow function)

**Approach**:

1. Extract `LoginFormSection` component (`src/components/auth/LoginFormSection.tsx`):
   - Receives `email`, `password`, `error`, `onEmailChange`, `onPasswordChange`, `onSubmit`, `onGoogleLogin`
   - Renders the login form UI
2. `Login` page retains only state, handlers, and effect logic (~50 lines).

### `src/pages/AuthError.tsx` — line 21:29 (244-line arrow function)

**Approach**:

1. Extract `AuthErrorContent` component (`src/components/auth/AuthErrorContent.tsx`):
   - Receives `errorType`/`errorMessage`, renders the error UI (icon, title, steps, retry button)
2. `AuthError` page retains URL parsing, state, navigation logic.

### `src/App.tsx` — line 135:1 (Function 'App' 161 lines)

**Approach**:

1. Extract `AppRoutes` component (`src/components/AppRoutes.tsx`):
   - Contains the `<Routes>` block with all `<Route>` definitions
   - Returns the route tree
2. `App` retains only Provider wrapping + rendering `<AppRoutes />`.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "(pages/Contacts|pages/Inbox|pages/Stats|pages/Search|pages/Login|pages/AuthError|App\.tsx)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 4 — Admin + Rich-Text Components

**Estimated warnings fixed: 8**
**Files: 5**

### `src/components/admin/ContextAnalysisSection.tsx` — lines 44:49 (482 lines), 230:25 (305 lines), 403:54 (109 lines)

Three arrow functions flagged in one large component (~542 lines total).

**Approach**:

1. Extract `AnalysisFilterBar` component (`src/components/admin/AnalysisFilterBar.tsx`):
   - The status filter + date range controls
2. Extract `AnalysisFailureDetails` component (`src/components/admin/AnalysisFailureDetails.tsx`):
   - The expanded failure detail panel (the 305-line function at line 230)
3. Extract `AnalysisList` component (`src/components/admin/AnalysisList.tsx`):
   - Renders the scrollable list of analysis items (the 109-line function at line 403)
4. `ContextAnalysisSection` becomes a thin coordinator (~80 lines)

### `src/components/admin/JobsSection.tsx` — line 28:38 (280-line arrow function)

**Approach**:

1. Extract `useJobsSection` hook:
   - Owns: jobs state, polling, `fetchJobs`, `triggerJob`, `cancelJob` handlers
2. Extract `JobsList` component (`src/components/admin/JobsList.tsx`):
   - Renders the list of job rows
3. `JobsSection` becomes ~50 lines

### `src/components/admin/GitHubDebugSection.tsx` — line 482:45 (128-line arrow function)

**Approach**:

- The flagged function at line 482 is likely a large render callback or sub-renderer. Extract it as a named `GitHubDebugItemRow` component in the same file or a sibling file.

### `src/components/rich-text/RichTextToolbar.tsx` — line 82:64 (421-line arrow function)

One of the largest single-function violations.

**Approach**:

1. Extract toolbar button groups as sub-components (each group is a logical section):
   - `FormatButtons` (bold/italic/underline/strikethrough)
   - `HeadingButtons` (H1/H2/H3)
   - `ListButtons` (ordered/unordered/indent)
   - `InsertButtons` (link, image, etc.)
2. Extract `useRichTextToolbar` hook if there are state + handler clusters.
3. `RichTextToolbar` becomes a layout component assembling the button groups.

### `src/components/rich-text/RichTextEditor.tsx` — line 45:62 (228-line arrow function)

**Approach**:

1. Extract `useRichTextEditor` hook:
   - Owns: editor state, `onChange`, `onKeyDown`, paste handlers
2. Extract `RichTextEditorToolbarSection` or rely on the already-decomposed `RichTextToolbar`.
3. `RichTextEditor` becomes ~60 lines

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "(admin/ContextAnalysisSection|admin/JobsSection|admin/GitHubDebug|rich-text/RichText)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 5 — Inbox Components (Part 1)

**Estimated warnings fixed: 12**
**Files: 11**

### `src/components/inbox/InboxContent.tsx` — lines 123:58 (405 lines), 414:35 (114 lines)

**Approach**:

1. Extract `CategoryEmailList` component (`src/components/inbox/CategoryEmailList.tsx`):
   - Renders a single category's email rows
2. Extract `InboxEmptyState` component if not already extracted.
3. The 114-line sub-function at line 414 — extract as `InboxEmailRow` or `InboxCategoryAccordionHeader`.

### `src/components/inbox/SplitViewPanel.tsx` — line 39:62 (338 lines)

**Approach**:

1. Extract `useSplitViewPanel` hook:
   - Owns: panel sizing state, resize drag handlers
2. Extract `SplitViewEmailDetail` component:
   - Renders the right-panel email detail section
3. `SplitViewPanel` becomes ~80 lines

### `src/components/inbox/EmailActionsRow.tsx` — line 36:64 (256 lines)

**Approach**:

1. Extract `useEmailActions` hook (or reuse if one already exists):
   - Owns: snooze/archive/flag handler callbacks
2. Extract `SnoozeDropdown` component if the snooze UI is inline.
3. `EmailActionsRow` becomes ~80 lines

### `src/components/inbox/CategoryAccordion.tsx` — line 116:68 (211 lines)

**Approach**:

1. The 211-line arrow function at line 116 is a sub-renderer. Extract as `CategoryAccordionBody` component.

### `src/components/inbox/ProtoCategorySubAccordion.tsx` — line 39:84 (207 lines)

**Approach**:

1. Extract `ProtoCategoryEmailList` component for the email list rendering section.

### `src/components/inbox/Sidebar.tsx` — line 216:48 (171 lines)

**Approach**:

1. Extract `SidebarNavItems` component:
   - Renders the navigation links/items
2. `Sidebar` becomes ~60 lines

### `src/components/inbox/DebugPanel.tsx` — line 85:54 (168 lines)

**Approach**:

1. Move pure helper functions above the component (any `get*` or `format*` functions).
2. Extract `DebugPanelContent` for the inner content block.

### `src/components/inbox/InboxFilters.tsx` — lines 37:65 (190 lines), 245:67 (118 lines)

**Approach**:

1. Extract `InboxFilterChips` component for the filter chip group (the 118-line sub-function at 245).
2. Extract `useDateRangeFilter` hook for any date-picker state.

### `src/components/inbox/InboxHeader.tsx` — line 44:56 (155 lines)

**Approach**:

1. Extract `InboxModeSelector` component for the mode tabs (triage/action/follow-up).
2. `InboxHeader` becomes ~60 lines

### `src/components/inbox/BatchInfoBar.tsx` — line 14:58 (133 lines)

**Approach**:

1. Move any pure formatting helpers above the component.
2. Extract `BatchProgressBar` sub-component if the progress bar JSX is inline.

### `src/components/inbox/header/InboxHeaderActions.tsx` — line 26:70 (127 lines)

**Approach**:

1. Extract `HeaderActionButton` as a small reusable component for the repeated button pattern.
2. Move any helper functions above the component.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "components/inbox/(InboxContent|SplitViewPanel|EmailActionsRow|CategoryAccordion|ProtoCategorySubAccordion|Sidebar|DebugPanel|InboxFilters|InboxHeader|BatchInfoBar|header)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 6 — Inbox Debug + Email-Detail-Inline Components

**Estimated warnings fixed: 11**
**Files: 9**

### `src/components/inbox/debug/DebugCategorySummarySection.tsx` — lines 18:81 (305 lines), 132:36 (191 lines)

**Approach**:

1. Extract `CategorySummaryTable` component for the table rendering (the 305-line function at 18).
2. Extract `CategorySummaryRow` component for individual row rendering (the 191-line function at 132).

### `src/components/inbox/debug/DebugThreadLookupSection.tsx` — line 87:82 (193 lines)

**Approach**:

1. Move pure helper functions above the component.
2. Extract `ThreadLookupResults` component for the results display.

### `src/components/inbox/debug/DebugStarredSection.tsx` — line 26:72 (165 lines)

**Approach**:

1. Extract `StarredEmailList` component for the list rendering section.

### `src/components/inbox/debug/DebugSyncHistorySection.tsx` — line 80:80 (126 lines)

**Approach**:

1. Move formatter helpers above the component.
2. Extract `SyncHistoryList` sub-component.

### `src/components/email-detail-inline/ReplyRecipientsInput.tsx` — lines 40:74 (398 lines), 249:23 (178 lines)

**Approach**:

1. Extract `useReplyRecipients` hook (`src/hooks/useReplyRecipients.ts`):
   - Owns: recipient state, add/remove/validate handlers
2. Extract `RecipientChip` component for the individual recipient tag UI.
3. Extract `RecipientSuggestionsDropdown` component (the 178-line sub-function at 249).

### `src/components/email-detail-inline/ReplyComposer.tsx` — line 153:60 (291 lines)

**Approach**:

1. Extract `useReplyComposer` hook if state management is inline.
2. Extract `ReplyActionButtons` component for the send/discard/schedule button bar.
3. Extract `ReplyEditorSection` component for the editor + tone check section.

### `src/components/email-detail-inline/ToneCheckResult.tsx` — line 40:55 (131 lines)

**Approach**:

1. Move pure formatting helpers above the component.
2. Extract `ToneIssueList` sub-component for the list of tone issues.

### `src/components/email-detail-inline/ReplyComposerAttachments.tsx` — line 28:82 (120 lines)

**Approach**:

1. Extract `AttachmentChip` component for individual attachment items.
2. Move the file input handler above the component.

### `src/components/EmailDetailInline.tsx` — line 97:68 (198 lines)

**Approach**:

1. Move any pure helper functions above the component.
2. Extract `EmailDetailInlineHeader` component for the email header section.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "(inbox/debug|email-detail-inline|EmailDetailInline)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 7 — Settings Components (auto-responder + email-delivery)

**Estimated warnings fixed: 14**
**Files: 14**

### `src/components/settings/auto-responder/AutoResponderTemplateEditor.tsx` — line 120:88 (386 lines)

**Approach**:

1. Extract `useAutoResponderTemplate` hook:
   - Owns: template text, cursor position, variable insertion handlers
2. Extract `TemplateVariableButtons` component for the variable insertion toolbar.
3. Extract `TemplatePreviewPane` component for the live preview section.

### `src/components/settings/auto-responder/AutoResponderEmailPreview.tsx` — line 81:52 (310 lines)

**Approach**:

1. Extract `EmailPreviewHeader` and `EmailPreviewBody` sub-components.
2. Move pure formatting functions above the component.

### `src/components/settings/SchedulingPreferencesSection.tsx` — line 36:55 (309 lines)

**Approach**:

1. Extract `useSchedulingPreferences` hook.
2. Extract `SchedulingWindowPicker` component for the time window selection UI.
3. Extract `SchedulingDaySelector` component for the day-of-week toggles.

### `src/components/settings/auto-responder/AutoResponderExclusionSettings.tsx` — line 14:94 (243 lines)

**Approach**:

1. Extract `ExclusionList` component for the list of excluded addresses.
2. Extract `useExclusionSettings` hook.

### `src/components/settings/auto-responder/AutoResponderPreview.tsx` — line 63:74 (196 lines)

**Approach**:

1. Extract `PreviewEmailCard` sub-component.
2. Move helper functions above the component.

### `src/components/settings/auto-responder/AutoResponderAnalytics.tsx` — line 15:78 (161 lines)

**Approach**:

1. Extract `AnalyticsStatCard` component (may already exist — check for duplication with `Stats.tsx` `StatCard`).
2. Move pure calculation helpers above the component.

### `src/components/settings/auto-responder/AutoResponderQASettings.tsx` — line 11:80 (128 lines)

**Approach**:

1. Move any pure helper or config functions above the component.
2. Extract `QAThresholdSlider` sub-component if the slider section is large.

### `src/components/settings/email-delivery/EmailAccountsSection.tsx` — line 44:74 (233 lines)

**Approach**:

1. Extract `EmailAccountRow` component for individual account rows.
2. Extract `useEmailAccounts` hook.

### `src/components/settings/AccountDeletionSection.tsx` — line 15:49 (197 lines)

**Approach**:

1. Extract `DeletionConfirmationStep` component for the confirmation flow.
2. Move pure helper logic above the component.

### `src/components/settings/DataExportSection.tsx` — line 89:44 (198 lines)

**Approach**:

1. Extract `ExportFormatSelector` sub-component.
2. Extract `useDataExport` hook.

### `src/components/settings/email-delivery/ProviderSelectionModal.tsx` — line 15:78 (178 lines)

**Approach**:

1. Extract `ProviderCard` component for individual provider option cards.
2. Move the `PROVIDER_OPTIONS` config array above the component.

### `src/components/settings/email-delivery/BlockedKeywordsSection.tsx` — line 26:78 (169 lines)

**Approach**:

1. Extract `KeywordChip` component.
2. Extract `useBlockedKeywords` hook.

### `src/components/settings/email-delivery/ZohoAccountsSection.tsx` — line 22:72 (152 lines)

**Approach**:

1. Extract `ZohoAccountRow` component.
2. Move pure helpers above the component.

### `src/components/settings/email-delivery/Office365AccountsSection.tsx` — line 22:82 (152 lines)

**Approach**:

1. Extract `Office365AccountRow` component (may share pattern with `ZohoAccountRow`).
2. Move pure helpers above the component.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "settings/(auto-responder|AccountDeletion|DataExport|Scheduling|email-delivery)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 8 — Settings guide-ai + Integrations Components

**Estimated warnings fixed: 10**
**Files: 8**

### `src/components/settings/guide-ai/ProtoCategoriesModal.tsx` — lines 25:74 (343 lines), 202:13 (171 lines), 226:31 (144 lines)

Three violations in one file — highest priority in this batch.

**Approach**:

1. Extract `usePROTOCategories` hook:
   - Owns: categories state, add/edit/delete handlers
2. Extract `CategoryFormRow` component (the 171-line function at 202).
3. Extract `CategoryColorPicker` or `CategoryBadgePreview` (the 144-line function at 226).
4. `ProtoCategoriesModal` becomes ~80 lines.

### `src/components/settings/integrations/GitHubRepoMappingsSection.tsx` — lines 43:84 (389 lines), 180:21 (159 lines)

**Approach**:

1. Extract `useGitHubRepoMappings` hook.
2. Extract `RepoMappingRow` component (the 159-line sub-function at 180).
3. `GitHubRepoMappingsSection` becomes ~80 lines.

### `src/components/settings/guide-ai/ContextSectionsList.tsx` — line 58:72 (170 lines)

**Approach**:

1. Extract `ContextSectionItem` component for individual context item rendering.
2. Move helpers above the component.

### `src/components/settings/guide-ai/ProfileSettingsSection.tsx` — line 16:78 (179 lines)

**Approach**:

1. Extract `ProfileAvatarSection` and `ProfileFormFields` sub-components.
2. Extract `useProfileSettings` hook.

### `src/components/settings/guide-ai/ContextSection.tsx` — line 43:62 (144 lines)

**Approach**:

1. Move pure helper functions above the component.
2. Extract the modal/dialog JSX as a `ContextEditModal` component.

### `src/components/settings/guide-ai/SummarizationRulesSection.tsx` — line 36:84 (144 lines)

**Approach**:

1. Extract `SummarizationRuleItem` component.
2. Move helpers above the component.

### `src/components/settings/guide-ai/ToneSettingsSection.tsx` — line 19:72 (121 lines)

**Approach**:

1. Move pure config/helper functions above the component.
2. Extract `ToneStrengthSlider` sub-component if inline.

### `src/components/settings/guide-ai/ToneRuleItem.tsx` — line 16:58 (135 lines)

**Approach**:

1. Extract `ToneRuleEditForm` sub-component for the editing form.
2. Move helpers above the component.

#### Verify

```bash
cd client && npm run lint 2>&1 | grep -E "settings/(guide-ai|integrations)" | grep "max-lines-per-function"
# Should return no output
```

---

## Batch 9 — Miscellaneous Components

**Estimated warnings fixed: 15** (clears all remaining warnings)
**Files: 15**

### Files and approaches

| File                                                         | Line:Col      | Lines    | Approach                                                                                                             |
| ------------------------------------------------------------ | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/components/compose/TimePicker.tsx`                      | 21:54         | 224      | Extract `TimeSlotGrid` component + `useTimePicker` hook                                                              |
| `src/components/setup-wizard/WelcomeStep.tsx`                | 13:56         | 245      | Extract `WelcomeFeatureList` + `WelcomeActions` components                                                           |
| `src/components/setup-wizard/ContextAnalysisStep.tsx`        | 14:72         | 218      | Extract `useContextAnalysisStep` hook + `AnalysisProgressPanel` component                                            |
| `src/components/setup-wizard/EmailImportStep.tsx`            | 23:64         | 206      | Extract `ImportSourceSelector` + `ImportProgressBar` components                                                      |
| `src/components/setup-wizard/SetupWizard.tsx`                | 19:56         | 120      | Move step-config array above component; extract `StepIndicator` component                                            |
| `src/components/auth/PermissionsExplanation.tsx`             | 19:78         | 243      | Extract `PermissionItem` component + `PermissionsList` component                                                     |
| `src/components/booking/SlotSelection.tsx`                   | 25:60         | 140      | Move pure date/time helpers above component; extract `SlotGrid` component                                            |
| `src/components/common/TimezoneAutocomplete.tsx`             | 24:74         | 135      | Move pure filter/format helpers above component; extract `TimezoneOption` component                                  |
| `src/components/landing/WaitlistForm.tsx`                    | 26:58         | 145      | Extract `useWaitlistForm` hook; extract `WaitlistSuccessMessage` component                                           |
| `src/components/priority/CategoryOverrideModal.tsx`          | 19:76         | 176      | Extract `useCategoryOverride` hook; extract `OverrideReasonSelector` component                                       |
| `src/components/crm/CRMDealsSection.tsx`                     | 22:64         | 202      | Extract `useCRMDeals` hook; extract `DealCard` component                                                             |
| `src/components/crm/DealFormModal.tsx`                       | 38:67, 218:60 | 167, 165 | Extract `DealFormFields` component (167-line fn); extract `useContactAutocomplete` for 165-line fn                   |
| `src/components/crm/KanbanColumn.tsx`                        | 20:58         | 161      | Extract `KanbanCard` component; move pure helpers above component                                                    |
| `src/hooks/useEmailDetailInitialization.ts`                  | 52:45         | 153      | Split into two smaller callbacks: `useEmailDetailLoad` (data fetching) and `useEmailDetailThread` (thread expansion) |
| `src/components/scheduled-emails/ScheduledEmailsManager.tsx` | 8:49          | 137      | Extract `useScheduledEmails` (if not already extracted); extract `ScheduledEmailRow` component                       |

Also covers remaining email-detail components not in Batch 6:

- `src/components/email-detail/EmailBodyIframe.tsx` — 16:64 (159 lines): extract `useIframeResize` hook
- `src/components/email-detail/SchedulingRequestCard.tsx` — 20:76 (127 lines): extract `SchedulingSlotList` component

#### Verify (Final — should be 0 warnings)

```bash
cd client && npm run lint 2>&1 | tail -5
# Should show: ✖ 0 problems (0 errors, 0 warnings)
# Or no output at all
```

---

## Summary Table

| Batch                                          | Warnings Fixed | Files  | Key Rule                       |
| ---------------------------------------------- | -------------- | ------ | ------------------------------ |
| 1 — Magic strings                              | 6              | 1      | `no-restricted-syntax`         |
| 2 — max-statements + complexity                | 5              | 4      | `max-statements`, `complexity` |
| 3 — Page components                            | 9              | 7      | `max-lines-per-function`       |
| 4 — Admin + rich-text                          | 8              | 5      | `max-lines-per-function`       |
| 5 — Inbox components                           | 12             | 11     | `max-lines-per-function`       |
| 6 — Inbox debug + email-detail-inline          | 11             | 9      | `max-lines-per-function`       |
| 7 — Settings (auto-responder + email-delivery) | 14             | 14     | `max-lines-per-function`       |
| 8 — Settings (guide-ai + integrations)         | 10             | 8      | `max-lines-per-function`       |
| 9 — Miscellaneous                              | 18             | 17     | `max-lines-per-function`       |
| **Total**                                      | **93**         | **76** |                                |

---

## General Rules for All Batches

1. **No functional changes**: Refactoring only — same behaviour, just smaller functions.
2. **Extracted hooks go in `src/hooks/`** with the `use` prefix.
3. **Extracted components go in the same directory as their parent** (keep co-location).
4. **Pure helper functions** that don't use hooks should be moved **above** the component in the same file, not extracted to a new file (unless reused).
5. **Run lint after each file change** before moving to the next: `cd client && npm run lint -- --quiet 2>&1 | grep <filename>`
6. **Do not add `// eslint-disable` comments** — fix the violation structurally.
7. **Do not change `// eslint-disable` comments that already exist** (e.g. in `EmailDetail.tsx` — that existing disable comment is for `max-lines-per-function` on the whole component, which may remain if the `max-statements` fix alone is insufficient to split the component further).

---

## Running the Full Lint Check

```bash
cd /path/to/BearlyMail/client
npm run lint 2>&1 | tail -3
# After all 9 batches: ✖ 0 problems (0 errors, 0 warnings)
```

To count remaining warnings after any batch:

```bash
cd client && npm run lint 2>&1 | grep "warning" | wc -l
```
