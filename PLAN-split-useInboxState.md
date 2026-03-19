# Plan: Split `useInboxState` God Hook

**Issue:** #1225 (Critical Issue #1)
**Planned by:** Monk of Modularity 🧘
**Phase:** 1.3 → 3.1 (Foundation + Hook Decomposition)

## Problem

`useInboxState` is a 444-line god hook that:
- Composes 15+ sub-hooks
- Returns ~60 values to `Inbox.tsx`
- Causes full inbox re-render on ANY sub-hook state change
- Forces 4-layer prop drilling through `InboxView → InboxContent → InboxContentParts → CategoryAccordion → EmailListItem`

## Current Structure

```
useInboxState() → returns ~60 values
  ├── useInboxFilters() (dual instantiation — always called, sometimes ignored)
  ├── useEmailManagement()
  ├── useEmailSelection()
  ├── useInboxFollowUpData()
  ├── useInboxUIState() (bundles 10 more hooks)
  ├── useInboxInitialization()
  ├── useInboxTourRefs()
  ├── useInboxModeChanges()
  ├── useInboxCategoryAccordion()
  ├── useEmailActions()
  ├── useInboxEmailHandlers()
  ├── useInboxUrlSync()
  ├── useTabCounts()
  ├── useTriageSuggestions()
  └── useBatchSchedule()
```

## Proposed Solution: InboxContext Provider

### Step 1: Create `InboxContext` with sub-contexts

```typescript
// contexts/InboxContext.tsx
const InboxDataContext = createContext<InboxDataValue>(null!);
const InboxUIContext = createContext<InboxUIValue>(null!);
const InboxActionsContext = createContext<InboxActionsValue>(null!);
const InboxFiltersContext = createContext<InboxFiltersValue>(null!);
```

Split into 4 sub-contexts to prevent unnecessary re-renders:
- **InboxDataContext**: emails, categorySummary, loading states, hasMore, totalCount
- **InboxUIContext**: splitView, modals, snoozeInput, debugPanel, keyboardHint, tourRefs
- **InboxActionsContext**: emailActions, handleEmailClick, handleEmailSelect, fetchEmails, loadMore
- **InboxFiltersContext**: inboxFilters (mode, accountFilter, categoryFilter, priorityFilter)

### Step 2: Create `InboxProvider` component

```typescript
// contexts/InboxProvider.tsx
export function InboxProvider({ children, isFocusedMode = false }) {
  // All existing useInboxState logic lives here
  // But instead of returning 60 values, it provides them via context
  return (
    <InboxFiltersContext.Provider value={filters}>
      <InboxDataContext.Provider value={data}>
        <InboxActionsContext.Provider value={actions}>
          <InboxUIContext.Provider value={ui}>
            {children}
          </InboxUIContext.Provider>
        </InboxActionsContext.Provider>
      </InboxDataContext.Provider>
    </InboxFiltersContext.Provider>
  );
}
```

### Step 3: Create consumer hooks

```typescript
export const useInboxData = () => useContext(InboxDataContext);
export const useInboxUI = () => useContext(InboxUIContext);
export const useInboxActions = () => useContext(InboxActionsContext);
export const useInboxFiltersCtx = () => useContext(InboxFiltersContext);
```

### Step 4: Migrate consumers incrementally

Each child component switches from prop-drilling to context consumption:

**Before:**
```tsx
// InboxContent receives ~40 props passed through from Inbox.tsx
function InboxContent({ emails, loading, fetchEmails, handleEmailClick, ... }) {
```

**After:**
```tsx
function InboxContent() {
  const { emails, loading } = useInboxData();
  const { fetchEmails } = useInboxActions();
  const { handleEmailClick } = useInboxActions();
```

### Step 5: Eliminate dual `useInboxFilters` instantiation

Once filters are in context, remove the `inboxFilters` option from `useInboxState`. The provider owns the single instance.

## Migration Order

1. Create context files (no behavior change)
2. Wrap `Inbox.tsx` and `FocusedInbox.tsx` with `InboxProvider`
3. Move `useInboxState` logic into `InboxProvider` (still returns same values temporarily)
4. Migrate leaf components first (EmailListItem, CategoryAccordion) to use context
5. Migrate intermediate components (InboxContent, InboxContentParts)
6. Remove prop-passing from intermediate components
7. Delete `useInboxState` once all consumers use context

## Return Value → Context Mapping

| Current return value | Target context | Notes |
|---------------------|---------------|-------|
| `mode`, `setMode` | InboxFiltersContext | Mode is a filter concern |
| `emails`, `loading`, `decrypting`, `fetchError` | InboxDataContext | Core data |
| `categorySummary`, `loadedCategoryNames`, `loadingCategoryNames` | InboxDataContext | Category data |
| `expandedCategories`, `stableCategoryOrder`, `toggleCategory` | InboxUIContext | Accordion UI state |
| `splitView`, `modals`, `snoozeInput`, `debugPanel` | InboxUIContext | UI hooks |
| `emailActions`, `handleEmailClick`, `handleEmailSelect` | InboxActionsContext | Stable callbacks |
| `fetchEmails`, `loadMore`, `fetchCategoryEmails` | InboxActionsContext | Data operations |
| `tourSteps`, `*Ref` | InboxUIContext | Tour/ref concerns |
| `inboxFilters` | InboxFiltersContext | Single instance |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Context re-renders propagating | 4 sub-contexts ensure only relevant consumers re-render |
| `FocusedInbox` diverging | Both pages share `InboxProvider` with `isFocusedMode` flag |
| Existing tests relying on prop structure | Migrate tests alongside component changes |
| `openEmailRef` / `isMobileRef` circular deps | These become provider-level refs, no cross-hook dependency |

## Estimated Effort

- Context creation + provider: **S** (< 1 day)
- Consumer migration: **M** (2-3 days, incremental)
- Test updates: **S** (1 day)
- Total: **M** (3-4 days)

## Dependencies

- None (this is a foundation task)
- Blocks: Phase 3 hook decomposition, Phase 4 component extraction
