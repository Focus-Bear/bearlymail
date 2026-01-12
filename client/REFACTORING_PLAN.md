# Refactoring Plan - Remaining Issues

## Summary
- **Total ESLint warnings**: ~577 (150 magic strings, 427 untranslated strings, plus function/file size warnings)
- **Large files needing refactoring**: 3 major pages (Compose, Search, EmailDetail)
- **Large hooks needing refactoring**: 2 hooks (useSettingsData, useInboxState)

---

## Priority 1: Critical Refactoring (Large Files)

### 1. EmailDetail.tsx (2440 lines, 2208-line function) ⚠️ CRITICAL
**Status**: Pending  
**Priority**: HIGHEST  
**Issues**:
- File exceeds 800-line limit (2440 lines)
- Main function exceeds 200-line limit (2208 lines)
- Massive "god component"

**Plan**:
- Extract `useEmailDetailState` hook (all state management)
- Extract `useEmailDetailOperations` hook (all handlers/API calls)
- Extract UI components:
  - `EmailDetailHeader` (title, back button, actions)
  - `EmailDetailContent` (main content wrapper)
  - `SummarySection` (summary display and controls)
  - `ThreadView` (thread list display)
  - `GitHubSection` (GitHub status display)
  - `ActionItemsSection` (action items management)
  - `PrivateNotesSection` (notes management)
  - `ReplySection` (reply composer and options)
  - `QuickActionsSection` (quick actions button and modals)

**Estimated effort**: High (largest file)

---

### 2. Compose.tsx (890 lines, 777-line function) ⚠️ HIGH
**Status**: Pending  
**Priority**: HIGH  
**Issues**:
- File exceeds 800-line limit (890 lines)
- Main function exceeds 200-line limit (777 lines)

**Plan**:
- Extract `useComposeForm` hook (form state and validation)
- Extract `useContactSearch` hook (contact search logic)
- Extract UI components:
  - `RecipientFields` (to/cc/bcc inputs with search)
  - `ComposeBody` (subject and body inputs)
  - `ComposeActions` (send button and actions)
  - `ContactSearchDropdown` (search results dropdown)
  - `FrequentContactsList` (frequent contacts display)

**Estimated effort**: Medium-High

---

### 3. Search.tsx (996 lines, 892-line function) ⚠️ HIGH
**Status**: Pending  
**Priority**: HIGH  
**Issues**:
- File exceeds 800-line limit (996 lines)
- Main function exceeds 200-line limit (892 lines)

**Plan**:
- Extract `useSearch` hook (search state and API calls)
- Extract `useSearchDebug` hook (debug panel state)
- Extract UI components:
  - `SearchHeader` (search input and form)
  - `SearchProgress` (progress indicator)
  - `SearchResults` (results list)
  - `SearchDebugPanel` (debug information panel)
  - `ScoreBreakdownModal` (score breakdown modal)

**Estimated effort**: Medium-High

---

## Priority 2: Hook Refactoring

### 4. useSettingsData.ts (590 lines, 469-line function)
**Status**: Created but needs splitting  
**Priority**: MEDIUM  
**Issues**:
- Hook function exceeds 100-line limit (469 lines)

**Plan**:
- Split into multiple hooks:
  - `useSettingsData` (main data fetching)
  - `useContextManagement` (context CRUD operations)
  - `useToneRules` (tone rules management)
  - `useSummarizationRules` (summarization rules management)
  - `useApiKeys` (OpenAI/GitHub token management)
  - `useAnalysisProgress` (analysis progress polling)

**Estimated effort**: Medium

---

### 5. useInboxState.ts (296 lines, 216-line function)
**Status**: Created but needs splitting  
**Priority**: MEDIUM  
**Issues**:
- Hook function exceeds 100-line limit (216 lines)

**Plan**:
- Already well-structured, but could extract:
  - `useInboxData` (data fetching and state)
  - `useInboxActions` (action handlers)
  - `useInboxUI` (UI state like modals, tooltips)

**Estimated effort**: Low-Medium

---

## Priority 3: Component Refactoring

### 6. ContextSection.tsx (358 lines)
**Status**: Needs review  
**Priority**: LOW  
**Issues**:
- Large component, could be split further

**Plan**:
- Extract sub-components if function exceeds 100 lines
- Review and extract if needed

**Estimated effort**: Low

---

### 7. Admin Components
**Status**: Needs refactoring  
**Priority**: LOW  
**Issues**:
- `SubscriptionsSection.tsx`: 146-line and 109-line functions
- `WaitlistSection.tsx`: 134-line function

**Plan**:
- Extract sub-components for large functions
- Split rendering logic from business logic

**Estimated effort**: Low

---

## Priority 4: ESLint Warnings (Non-blocking)

### 8. Magic Strings (150 warnings)
**Status**: Warnings only  
**Priority**: LOW  
**Plan**:
- Replace magic strings in comparisons with constants
- Add to `constants/strings.ts` as needed
- Use automated find/replace where possible

**Estimated effort**: Medium (tedious but straightforward)

---

### 9. Untranslated Strings (427 warnings)
**Status**: Warnings only  
**Priority**: LOW  
**Plan**:
- Add translations to `locales/en.json`
- Replace literal strings with `t()` calls
- Focus on user-facing strings first

**Estimated effort**: High (many strings to translate)

---

## Recommended Order

1. **EmailDetail.tsx** (highest impact, largest file)
2. **Compose.tsx** (high impact, large file)
3. **Search.tsx** (high impact, large file)
4. **useSettingsData.ts** (medium impact, improve hook structure)
5. **useInboxState.ts** (low-medium impact, already decent)
6. **Admin components** (low impact, quick wins)
7. **Magic strings** (low priority, can be done incrementally)
8. **Untranslated strings** (low priority, can be done incrementally)

---

## Notes

- All files compile successfully (warnings only, no errors)
- Absolute imports are now set up and working
- ESLint rules are configured and catching issues
- Build is successful





