# Plan: Consolidate EmailDetail / EmailDetailInline Duplicated Logic (Fixes #698)

> 🗂️ *Planned by Monk of Modularity (AI agent)*  
> Branch: `monk/698-consolidate-email-detail`  
> Date: 2026-03-07

---

## 1. Current State — What Exists

The codebase contains two parallel email-detail rendering paths that share significant conceptual overlap but diverge in implementation:

### 1a. `pages/EmailDetail.tsx` — Full Page View

- **Role:** Router-mounted full-page email viewer (`/email/:id`)
- **Size:** ~274 lines (plus two local sub-components: `EmailDetailContent`, `EmailDetailNotesAndActions`)
- **Key features:**
  - `forwardRef` + `useImperativeHandle` exposing `openReplyComposer`, `archive`, `snooze`, `setStarCount` for external control by `SplitViewPanel`
  - `compactMode` prop that strips the sidebar, animation overlay, and full-page layout (for split view usage)
  - `EmailDetailAnimationOverlay` + `EmailDetailSidebar` (full mode only)
  - Rich `EmailDetailHeader` with priority score and breakdown
  - Rich `EmailDetailActions` toolbar (quick actions menu, calendar invites, scheduling request card, priority buttons, unsubscribe/block)
  - `SummarySection` with AI summaries and custom rules
  - `GitHubStatusSection` + `CRMDealsSection` (conditionally placed depending on `compactMode`)
  - `ReplyComposer` (from `email-detail-inline/`)
- **Hooks:** `useEmailDetailState`, `useEmailDetailOperations`, `useEmailDetailInitialization`, `useEmailDetailDraftSync`, `useEmailDetailTimePicker`

### 1b. `components/EmailDetailInline.tsx` — Inline/Panel View

- **Role:** Embedded panel component (used inside inbox drawers / slide-overs)
- **Size:** ~191 lines
- **Key features:**
  - No sidebar, no animation overlay, no router integration
  - `onClose`, `onArchive`, `onSetStarCount`, `onBlockSender` callbacks (caller controls lifecycle)
  - `EmailContentActionBar` with Reply All / Forward / Archive / Snooze + `PriorityButtonRow`
  - `EmailDetailContent` (from `email-detail-inline/`) renders notes, action items, GitHub, CRM, thread list, body
  - `ReplyComposer` (from `email-detail-inline/`)
  - Time picker wired via local `useTimePickerHandlers` + `useScheduledEmails`
- **Hooks:** `useEmailDetailInline` (composes `useEmailDetailFetching`, `useEmailDetailNotes`, `useEmailDetailActionItems`, `useEmailDetailReplies`)
- **⚠️ Finding:** `EmailDetailInline` is **not imported anywhere** in the live app. It exists in `components/EmailDetailInline.tsx` but has zero consumers outside its own file and `useEmailDetailInline.ts`. It appears to be a partially-built alternative path.

### 1c. `components/email-detail-inline/EmailDetailContent.tsx` — Inline Content Renderer

- **Role:** The pure content renderer used by `EmailDetailInline`
- **Size:** ~252 lines
- **Contains duplicated sub-components:**
  - `PriorityButtonRow` — priority button UI (also exists identically in `EmailDetailActions`)
  - `EmailActionButtons` — reply/forward/archive/snooze buttons (duplicates button logic from `EmailDetailActions`)
  - `EmailContentActionBar` — wires the above two (duplicates `EmailDetailActions` at a higher level)
  - `useEmailAdminData` — fetches Gmail star/label status for admins

### 1d. `hooks/useEmailDetail.ts` — Legacy Fetch Hook

- **Role:** Original simple fetch hook (not used by either main path above; appears to be dead code or used only in tests)
- **Size:** 93 lines — fetches email + thread, manages `expandedThreadItems`

---

## 2. What's Duplicated

| Feature | `EmailDetail` page | `EmailDetailInline` |
|---|---|---|
| Reply/Forward/Archive/Snooze button row | `EmailDetailActions` (rich) | `EmailActionButtons` (simpler copy) |
| Priority buttons | `PriorityButtonRow` in `EmailDetailActions` | `PriorityButtonRow` in `EmailDetailContent.tsx` — **identical component, different file** |
| Unsubscribe / Block sender button | `EmailDetailActions` | `EmailActionButtons` |
| `handleDraftChange` logic (customDraftRef) | `EmailDetailContent` local fn | `useEmailDetailInlineHandlers` — **character-for-character identical** |
| `handleReplyOptionSelect` logic (custom tab restore) | `EmailDetailContent` local fn | `useEmailDetailInlineHandlers` — **identical** |
| `handleReplyClose` logic | `handleReplyClose` local fn | `handleReplyComposerClose` — **identical** |
| PrivateNotesSection + ActionItemsSection | `EmailDetailNotesAndActions` | `EmailDetailContent` (inline) |
| GitHubStatusSection | `EmailDetailContent` (conditional on `!compactMode`) | `EmailDetailContent` inline |
| CRMDealsSection | `EmailDetailContent` (conditional) | `EmailDetailContent` inline |
| Thread list + body rendering | `EmailThreadView` | `EmailThreadList` + `EmailDetailBody` |
| Loading / not-found states | Inline in `EmailDetail` | `LoadingSpinner` + `EmailNotFound` components |

### Key Differences (Must Preserve)

| Aspect | `EmailDetail` page only | `EmailDetailInline` only |
|---|---|---|
| Routing | `useParams` for email ID | Prop-based `emailId` |
| Sidebar | `EmailDetailSidebar` | None |
| Animation | `EmailDetailAnimationOverlay` | None |
| External control | `forwardRef` / `useImperativeHandle` | None |
| Summary section | `SummarySection` with AI + custom rules | None |
| Action richness | Quick actions menu, calendar invite responses, scheduling request card | Simpler reply/forward/archive/snooze only |
| Hook architecture | 5 specialized hooks (state, ops, init, draft sync, time picker) | 1 composed hook (`useEmailDetailInline`) |
| Time picker wiring | `useEmailDetailTimePicker` | `useTimePickerHandlers` + `useScheduledEmails` |
| Snooze | Via `useEmailDetailOperations` | Via inline `SnoozeInputForm` |

---

## 3. Proposed Consolidation Approach

### Strategy: **Shared Hook Base + Unified Content Component with Context Prop**

Rather than forcing a single monolithic component, the plan targets three surgical consolidations:

### 3a. Extract `useEmailDetailDraftHandlers` (Immediate Win — Zero Risk)

Create `hooks/useEmailDetailDraftHandlers.ts` that exports:
```ts
export function useEmailDetailDraftHandlers(
  draft: string,
  replyOptions: ReplyOption[] | null,
  setDraft: (d: string) => void,
  setSelectedReplyOption: (idx: number) => void,
  setReplyOptions: (opts: ReplyOption[] | null) => void,
  setToneCheckResult: (r: any) => void,
  setShowReplyComposer: (show: boolean) => void,
) {
  const customDraftRef = useRef<string>('');
  const handleDraftChange = ...   // identical in both paths
  const handleReplyOptionSelect = ...  // identical in both paths
  const handleReplyClose = ...  // identical in both paths
  return { customDraftRef, handleDraftChange, handleReplyOptionSelect, handleReplyClose };
}
```
Both `EmailDetail` and `EmailDetailInline` consume this hook. **~50 lines eliminated.**

### 3b. Extract Shared `PriorityButtonRow` (Clean Up Duplicate Component)

Move `PriorityButtonRow` from `email-detail-inline/EmailDetailContent.tsx` into a shared location (e.g., `components/email-detail/PriorityButtonRow.tsx`) and import it from both:
- `EmailDetailActions.tsx`
- `email-detail-inline/EmailDetailContent.tsx`

This de-duplicates the component that is currently copy-pasted verbatim.

### 3c. Consolidate `EmailDetailInline` into `EmailDetail` via `variant` prop (Medium-Term)

Since `EmailDetailInline` has **no live consumers**, this is the right time to:

1. Extend `EmailDetail`'s existing `compactMode` into a richer `displayVariant`:
   ```ts
   type EmailDetailVariant = 'full' | 'compact' | 'inline';
   ```
   - `full` — current default (sidebar, overlay, full page)
   - `compact` — current `compactMode` (split view, no sidebar, forwardRef control)
   - `inline` — replaces `EmailDetailInline` (panel/drawer, `onClose` callback, simpler action bar)

2. Migrate `useEmailDetailInline`'s hook composition to be an alternative code path inside `useEmailDetailOperations` (or as a thin adapter), then delete `useEmailDetailInline.ts` and `EmailDetailInline.tsx`.

3. The `email-detail-inline/EmailDetailContent.tsx` action bar (`EmailContentActionBar`, `EmailActionButtons`) gets retired in favor of the unified action bar driven by props.

**Result:** One component, three variants. The `email-detail-inline/` folder retains only genuinely shared sub-components (ReplyComposer, ActionItemsSection, PrivateNotesSection, etc.).

### 3d. Archive `hooks/useEmailDetail.ts` (Cleanup)

Verify it has no live consumers (tests only?), then delete or clearly mark as `@deprecated`.

---

## 4. Migration Steps

### Phase 1 — Safe Extractions (No Behaviour Change, 1–2 days)

- [ ] **Create `useEmailDetailDraftHandlers`** hook
  - Extract identical `customDraftRef`, `handleDraftChange`, `handleReplyOptionSelect`, `handleReplyClose` from both files
  - Update `EmailDetail.tsx` `EmailDetailContent` local component to use it
  - Update `EmailDetailInline.tsx` `useEmailDetailInlineHandlers` to use it
  - Add unit tests for the extracted hook
- [ ] **Extract shared `PriorityButtonRow`**
  - Move to `components/email-detail/PriorityButtonRow.tsx`
  - Update imports in `EmailDetailActions.tsx` and `email-detail-inline/EmailDetailContent.tsx`
  - Confirm no visual regression

### Phase 2 — Variant Prop on EmailDetail (2–3 days)

- [ ] Add `displayVariant: 'full' | 'compact' | 'inline'` prop to `EmailDetail` (keep backward compat: `compactMode=true` → maps to `'compact'`)
- [ ] Add `onClose?` prop to `EmailDetail` (for `inline` variant)
- [ ] Wire `inline` variant rendering: simplified action bar, no sidebar, no overlay, no summary section
- [ ] Add Storybook stories for all three variants:
  - `EmailDetail.stories.tsx` — `Full`, `Compact`, `Inline` stories with MSW mocks
- [ ] Write integration tests for inline variant callback firing

### Phase 3 — Remove Dead Code (1 day, after Phase 2 ships)

- [ ] Delete `components/EmailDetailInline.tsx`
- [ ] Delete `hooks/useEmailDetailInline.ts`
- [ ] Delete `email-detail-inline/EmailContentActionBar`, `EmailActionButtons`, `PriorityButtonRow` (now all in shared location)
- [ ] Mark `hooks/useEmailDetail.ts` as `@deprecated` or delete if confirmed unused
- [ ] Update `email-detail-inline/index.ts` barrel

---

## 5. Backward Compatibility

- `EmailDetail` keeps all existing props (`emailId`, `compactMode`, `onArchiveComplete`, `onSnoozeComplete`, `autoGenerateReplies`, `onCorrespondentChange`, `ref`)
- `compactMode` remains functional (maps to `displayVariant='compact'` internally); deprecated but not removed until next major cleanup
- `EmailDetailInline` is **not imported anywhere live**, so it can be deleted without a deprecation window
- All existing `email-detail-inline/` sub-components (`ReplyComposer`, `ActionItemsSection`, `PrivateNotesSection`, etc.) remain in place — they are shared utilities, not duplications

---

## 6. Storybook Stories to Add/Update

| Story file | Stories |
|---|---|
| `EmailDetail.stories.tsx` (new) | `FullView`, `CompactView`, `InlineView`, `LoadingState`, `EmailNotFound` |
| `EmailDetailActions.stories.tsx` (update) | Add story with `hideActionButtons=true` |
| `PriorityButtonRow.stories.tsx` (new) | `AllOptions`, `ActiveState` |

---

## 7. Tests to Update

| Test file | Changes |
|---|---|
| `useEmailDetailDraftHandlers.test.ts` (new) | Unit test extracted hook |
| `EmailDetailHeader.test.tsx` | No changes needed |
| `ReplyComposerFooter.test.tsx` | No changes needed |
| `ThreadItemHeader.test.tsx` | No changes needed |
| `useEmailDetailOperations.test.ts` | Add inline variant path |
| e2e (`e2e/`) | Ensure `email-detail` suite covers inline variant once wired |

---

## 8. Risk & Rollback Plan

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `EmailDetailInline` was silently used somewhere (dynamic import / lazy load) | Low | Grep for any dynamic `import('…EmailDetailInline')` patterns before deletion; keep file during Phase 2 |
| `displayVariant` prop change breaks SplitViewPanel | Medium | Keep `compactMode` alias; add TS deprecation notice; test SplitViewPanel explicitly |
| Extracted hook causes subtle behaviour difference in draft restoration | Low | Add unit tests first; test manually in both full-page and compact modes before merge |
| `PriorityButtonRow` style discrepancy between two copy-pasted versions | Low | Diff the two implementations before merging; they appear identical but confirm |

### Rollback

- Phase 1 is purely additive — reversing means deleting the new hook file and restoring the two original inline implementations. No API surface change.
- Phase 2: `displayVariant` is additive to `EmailDetail` props. If issues arise, remove `inline` variant and keep `compactMode` as-is.
- Phase 3 (deletions): covered by git history. Restore with `git revert`.

---

## 9. Definition of Done

- [ ] `useEmailDetailDraftHandlers` extracted and tested
- [ ] `PriorityButtonRow` lives in one place
- [ ] `EmailDetail` supports `inline` variant (renders like old `EmailDetailInline`)
- [ ] `EmailDetailInline.tsx` and `useEmailDetailInline.ts` deleted
- [ ] No dead code warnings from ESLint
- [ ] Storybook renders all three variants without errors
- [ ] Existing CI suite passes (unit + e2e)
- [ ] PR reviewed and approved by Codebeard

---

*🗂️ Planned by Monk of Modularity (AI agent)*
