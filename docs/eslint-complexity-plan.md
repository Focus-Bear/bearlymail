# ESLint Complexity Plan — BearlyMail Client

> Generated from lint run on branch `fix/issue-616`.
> **Goal:** eliminate all remaining warnings across 5 rule categories.
> **Rule:** planning only — no implementation changes in this document.

---

## Summary of Violations

| Rule                          | Count | Scope                    |
| ----------------------------- | ----- | ------------------------ |
| `max-lines-per-function`      | 113   | Components, hooks, pages |
| `complexity`                  | 20    | Hooks, components, utils |
| `react-hooks/exhaustive-deps` | 12    | Hooks, components        |
| `max-statements`              | 10    | Hooks                    |
| `max-lines`                   | 2     | Files                    |

---

## Priority Order

1. **`react-hooks/exhaustive-deps`** — 12 violations, high risk of subtle bugs; mostly mechanical fixes
2. **`max-lines`** — 2 violations, clearest signal to split files; unblocks other rules
3. **`max-statements`** — 10 violations, concentrated in hooks; extract sub-functions
4. **`complexity`** — 20 violations, overlap with above; simplify conditionals / extract logic
5. **`max-lines-per-function`** — 113 violations, largest set but mostly addressed as a byproduct of fixing the above

---

## Rule 1: `react-hooks/exhaustive-deps` (12 violations)

### Quick wins (unnecessary deps — just remove from array)

| File                                | Line   | Issue                                                           | Fix                   | Effort |
| ----------------------------------- | ------ | --------------------------------------------------------------- | --------------------- | ------ |
| `hooks/usePriorityTooltip.ts`       | 59, 72 | `priorityExplanation` unnecessary in 2x useCallback             | Remove from dep array | XS     |
| `hooks/useEmailDetailOperations.ts` | 858    | `draft` unnecessary in useCallback                              | Remove `draft`        | XS     |
| `hooks/useKeyboardShortcuts.ts`     | 223    | `emailDetailRef`, `onArchive`, `onSplitViewArchive` unnecessary | Remove all three      | XS     |
| `hooks/useEmailFetching.ts`         | 156    | `filters`, `mode` unnecessary in useCallback                    | Remove from dep array | XS     |

### Missing deps (require care to avoid infinite loops)

| File                                                     | Line | Missing                                                                  | Fix                                              | Effort |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------ | ------------------------------------------------ | ------ |
| `pages/Settings.tsx`                                     | 77   | `settingsData`                                                           | Wrap in useRef or restructure effect             | S      |
| `components/inbox/SplitViewPanel.tsx`                    | 70   | `selectedEmail`                                                          | Add dep + guard against null                     | S      |
| `components/email-detail-inline/PrivateNotesSection.tsx` | 47   | `noteContent`                                                            | Add dep or use useRef for prev value             | S      |
| `hooks/settings/useAnalysisProgress.ts`                  | 358  | `stageOrder`                                                             | Add dep or memoize with useMemo                  | S      |
| `components/setup-wizard/ContextAnalysisStep.tsx`        | 24   | `analyzeProgress.isComplete`, `analyzing`, `startAnalysis`               | Add all three; guard loop risk                   | M      |
| `hooks/useInboxState.ts`                                 | 466  | `getBasePath`, `mode`, `navigate`, `splitView`, `urlMode`, `urlThreadId` | Wrap getBasePath in useCallback; add stable deps | M      |
| `hooks/useInboxState.ts`                                 | 498  | `mode`, `splitView`                                                      | Add missing deps; audit for loop risk            | S      |

---

## Rule 2: `max-lines` (2 violations)

| File                                | Lines | Limit | Fix                                                                                       | Effort |
| ----------------------------------- | ----- | ----- | ----------------------------------------------------------------------------------------- | ------ |
| `hooks/useEmailDetailOperations.ts` | 1049  | 800   | Split into `useEmailDetailDraftOps`, `useEmailDetailArchiveOps`, `useEmailDetailReplyOps` | L      |
| `pages/EmailDetail.tsx`             | 883   | 800   | Extract `EmailDetailToolbar`, `EmailDetailThreadList` sub-components                      | M      |

---

## Rule 3: `max-statements` (10 violations)

| File                                         | Line | Stmts | Fix                                                               | Effort |
| -------------------------------------------- | ---- | ----- | ----------------------------------------------------------------- | ------ |
| `hooks/useSearch.ts`                         | 49   | 68    | Extract `buildSearchParams()` + `processSearchResults()`          | M      |
| `hooks/useInboxState.ts`                     | 45   | 67    | Extract `useInboxRouting()` + `useInboxSelectionState()` hooks    | M      |
| `hooks/useKeyboardShortcuts.ts`              | 101  | 47    | Extract `handleEmailNavigation()` + `handleActionKeys()` helpers  | M      |
| `hooks/useReplyDraftGeneration.ts`           | 107  | 46    | Extract `prepareDraftPayload()` + `handleDraftResponse()` helpers | M      |
| `hooks/useEmailDetailReplies.ts`             | 76   | 42    | Extract `buildReplyPayload()` helper                              | M      |
| `hooks/useEmailDetailReplies.ts`             | 183  | 37    | Extract `submitReply()` helper                                    | M      |
| `hooks/useEmailDetailOperations.ts`          | 770  | 44    | Part of planned file split                                        | L      |
| `hooks/useEmailDetailOperations.ts`          | 692  | 34    | Part of planned file split                                        | L      |
| `hooks/useEmailDetailInitialization.ts`      | 107  | 32    | Extract `resolveInitialEmail()` helper                            | S      |
| `hooks/settings/useAnalysisProgress.ts`      | 274  | 32    | Extract `handleStageTransition()` helper                          | S      |
| `components/priority/CategoryDebugModal.tsx` | 65   | 48    | Extract `useCategoryDebugData()` hook                             | M      |

---

## Rule 4: `complexity` (20 violations)

### Critical (complexity >= 35)

| File                                                    | Line | Complexity | Fix                                                                        | Effort |
| ------------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------- | ------ |
| `components/admin/GitHubDebugSection.tsx`               | 57   | 41         | Split into sub-components per debug category; extract `useGitHubDebug()`   | L      |
| `components/email-detail-inline/EmailDetailContent.tsx` | 483  | 41         | Extract `renderEmailSection()`, `renderAttachments()`, `renderActions()`   | L      |
| `components/inbox/InboxContent.tsx`                     | 71   | 36         | Extract `useInboxLayoutLogic()`; split `InboxListView` + `InboxEmptyState` | L      |

### High (complexity 25–34)

| File                                                                 | Line | Complexity | Fix                                                                                              | Effort |
| -------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------ | ------ |
| `utils/unsubscribeUtils.ts`                                          | 13   | 27         | Break `extractUnsubscribeLink` into `extractFromHeader()`, `extractFromBody()`, `normaliseUrl()` | M      |
| `components/email-detail/CalendarInviteActions.tsx`                  | 19   | 29         | Extract `useCalendarResponse()` hook                                                             | M      |
| `components/inbox/debug/DebugThreadLookupSection.tsx`                | 14   | 28         | Extract `useThreadLookup()` hook                                                                 | M      |
| `hooks/useKeyboardShortcuts.ts`                                      | 101  | 28         | See max-statements fix                                                                           | M      |
| `pages/ContactDetail.tsx`                                            | 16   | 30         | Extract `useContactDetailData()` + `ContactHeader` sub-component                                 | L      |
| `components/settings/integrations/GitHubConnectionStatusSection.tsx` | 36   | 26         | Extract `useGitHubConnectionStatus()` hook                                                       | M      |
| `hooks/useSearch.ts`                                                 | 49   | 26         | See max-statements fix                                                                           | M      |
| `hooks/useEmailDetailInitialization.ts`                              | 107  | 26         | See max-statements fix                                                                           | S      |

### Medium (complexity 21–24)

| File                                                 | Line | Complexity | Fix                                           | Effort |
| ---------------------------------------------------- | ---- | ---------- | --------------------------------------------- | ------ |
| `components/email-detail-inline/ReplyComposer.tsx`   | 82   | 24         | Extract `useReplyComposerState()` hook        | M      |
| `hooks/useReplyDraftGeneration.ts`                   | 107  | 24         | See max-statements fix                        | M      |
| `components/settings/AnalysisProgressModal.tsx`      | 14   | 24         | Extract `useProgressStages()` hook            | S      |
| `components/settings/DataExportSection.tsx`          | 28   | 24         | Extract `useDataExport()` hook                | S      |
| `pages/EmailDetail.tsx`                              | 49   | 22         | Addressed by file split (max-lines)           | M      |
| `components/email-detail-inline/ToneCheckResult.tsx` | 29   | 22         | Simplify tone-severity switch with lookup map | S      |
| `components/admin/AdminTabs.tsx`                     | 11   | 22         | Replace switch with tab config array          | S      |
| `components/compose/ComposeActions.tsx`              | 14   | 21         | Extract `useComposeActionState()` hook        | S      |
| `components/crm/DealFormModal.tsx`                   | 24   | 21         | Extract `useDealFormValidation()` hook        | S      |
| `components/inbox/CategoryAccordion.tsx`             | 59   | 21         | Extract `useCategoryAccordion()` hook         | S      |
| `components/inbox/ProtoCategorySubAccordion.tsx`     | 22   | 21         | Extract `useSubAccordion()` hook              | S      |

---

## Rule 5: `max-lines-per-function` (113 violations)

Most violations will resolve as a byproduct of the fixes above. Key standalone items:

### Critical hooks (do these first — highest leverage)

| File                                           | Lines    | Fix                                           | Effort |
| ---------------------------------------------- | -------- | --------------------------------------------- | ------ |
| `hooks/useEmailDetailOperations.ts` (L121)     | 939      | Split into 3 focused hooks                    | XL     |
| `hooks/useEmailDetailReplies.ts` (L32)         | 248      | Extract `useSendReply()`, `useForwardReply()` | L      |
| `hooks/useSearch.ts` (L18, L49)                | 216, 166 | Extract `useSearchExecution()`                | M      |
| `hooks/useEmailActionsBase.ts` (L28)           | 193      | Extract per-action sub-hooks                  | M      |
| `hooks/useSettingsData.ts` (L21)               | 168      | Extract `useSettingsSections()`               | M      |
| `hooks/useReplyDraftGeneration.ts` (L37)       | 165      | Extract draft-prep helpers                    | M      |
| `hooks/useKeyboardShortcuts.ts` (L43)          | 158      | Extract key-handler helpers                   | M      |
| `hooks/settings/useAnalysisProgress.ts` (L123) | 191      | Extract stage-transition logic                | M      |
| `hooks/useEmailDetailInitialization.ts` (L31)  | 176      | Extract init helpers                          | M      |

### Pages

| File                            | Lines | Fix                                              | Effort |
| ------------------------------- | ----- | ------------------------------------------------ | ------ |
| `pages/ContactDetail.tsx` (L16) | 420   | Split + hook                                     | L      |
| `pages/Contacts.tsx` (L19)      | 429   | Extract `ContactListView`, `useContactsFilter()` | L      |
| `pages/Inbox.tsx` (L22)         | 344   | Extract `InboxLayout`                            | M      |
| `pages/Stats.tsx` (L204)        | 268   | Extract `StatsChartSection`, `useStatsData()`    | M      |
| `pages/Search.tsx` (L26)        | 255   | Extract `SearchResultsView`                      | M      |
| `pages/AuthError.tsx` (L9)      | 244   | Extract `AuthErrorContent` + `AuthErrorActions`  | M      |
| `pages/Login.tsx` (L14)         | 211   | Extract `LoginForm`, `useLoginFlow()`            | M      |
| `App.tsx` (L134)                | 161   | Extract `AppRouter` component                    | S      |

### Large admin/settings/inbox components (see Rule 4 section for per-file detail)

Remaining violations in `components/admin/*`, `components/settings/**`, `components/inbox/*`, `components/email-detail*`, `components/rich-text/*`, and `components/crm/*` should be resolved as part of their corresponding complexity/max-statements fixes above.

---

## Effort Key

| Symbol | Range     | Meaning                                       |
| ------ | --------- | --------------------------------------------- |
| XS     | < 30 min  | Dep-array tweak or single line change         |
| S      | 30–90 min | Extract one helper fn or hook                 |
| M      | 1.5–3 h   | Extract multiple helpers or a sub-component   |
| L      | 3–6 h     | Major refactor; split file into 2–3 new files |
| XL     | > 6 h     | Foundational restructure                      |

---

## Phased Execution Plan

### Phase 1 — Quick wins (1–2 days)

- All 4 XS `react-hooks/exhaustive-deps` unnecessary-dep removals
- All S-rated missing-dep fixes in `Settings.tsx`, `SplitViewPanel`, `PrivateNotesSection`, `useAnalysisProgress`

### Phase 2 — Hook consolidation (3–5 days)

- Split `useEmailDetailOperations.ts` (XL) — resolves max-lines + many downstream violations
- Extract helpers in `useSearch`, `useKeyboardShortcuts`, `useReplyDraftGeneration`, `useEmailDetailReplies`
- Fix remaining missing exhaustive-deps in `useInboxState`, `ContextAnalysisStep`

### Phase 3 — Component extraction (5–7 days)

- High-complexity components: `GitHubDebugSection`, `EmailDetailContent`, `InboxContent`
- Large page files: `ContactDetail`, `Contacts`, `Inbox`, `EmailDetail`
- Settings sub-components: `AutoResponderTemplateEditor`, `TokenUsageSection`, `ProtoCategoriesModal`

### Phase 4 — Final sweep (2–3 days)

- Systematic pass through remaining inbox/settings/email-detail components
- Many are XS–S extractions; batch into single PRs by directory
