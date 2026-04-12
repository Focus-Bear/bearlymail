# Plan: Fix Priority Filter Not Excluding Sub-Threshold Emails (#1186)

## Summary

With the filter set to "Very High (> 50)", emails with priority score 28 are still
rendering in the inbox. Root cause: **the filter state is split across two independent
`useInboxFilters()` instances** that are never synchronized — one instance manages
`fetchEmails` while the other manages the filter UI. The fetch always runs with
`minPriority: null` regardless of what the user selects.

---

## Root Cause

### The Dual-Instance Trap

`Inbox.tsx` instantiates `useInboxFilters()` **twice**:

1. **`useInboxState()`** (line 62 in `useInboxState.ts`) — creates its own internal
   `useInboxFilters()` instance and passes `inboxFilters.filters` down to
   `useEmailFetching`, `useEmailManagement`, `useInboxInitialization`,
   `useInboxModeChanges`. This is the instance that controls what `fetchEmails` sends
   to the API.

2. **`Inbox.tsx` component** (line 230) — creates a _separate_ `useInboxFilters()`
   instance as `filterState` and passes it to `InboxView` props. This is the instance
   whose `setPriorityFilter` is called by `InboxFilters.tsx` when the user changes the
   dropdown.

These two instances are independent React state objects. When the user selects
"Very High (>50)":

- `filterState.setPriorityFilter(50, null)` updates `filterState.filters.minPriority = 50`
- `inboxState.inboxFilters.filters.minPriority` **stays `null`** (different state)
- `fetchEmails(overrideFilters)` in `InboxFilters.tsx` is wired to `inboxState.fetchEmails`
- `fetchEmails` reads `filters` from its closure — `inboxState.inboxFilters.filters`
- API call goes out with `minPriority` absent (null → not appended)
- Server returns **all** emails regardless of priority score
- Priority-28 email renders in the inbox

### Why PR #1166 Didn't Fix It

PR #1166 fixed the **intra-instance** stale closure: when `setPriorityFilter` is called,
the new `minPriority` value is now passed as `overrideFilters` to `fetchEmails` directly
(bypassing the stale React state). That correctly solved the case where _one_ instance
is used for both filter state and fetch state.

But the dual-instance architecture means the `overrideFilters` patch arrives at
`inboxState.fetchEmails` while the permanent `filters` closure still reads from the
**wrong** instance. After the initial fetch with the override, any subsequent
`refreshInPlace` call (triggered by heartbeat, mode change, etc.) will again use
`inboxState.inboxFilters.filters` (still `null`) — emails re-appear.

### Code Path Walkthrough

```
User selects "Very High (>50)"
↓
InboxFilters.tsx::handlePriorityChange(min=50, max=null)
  ├─ filterState.setPriorityFilter(50, null)          ← updates filterState instance
  └─ onFilterChange({ minPriority: 50, maxPriority: null })
       └─ inboxState.fetchEmails({ minPriority: 50 }) ← overrideFilters applied once

inboxState.fetchEmails closure:
  filters = inboxState.inboxFilters.filters  ← still { minPriority: null }
  effectiveFilters = { ...null_filters, minPriority: 50 }  ← override works for first call

Later: refreshInPlace() / mode change triggers fetchEmails() with NO overrideFilters
  filters = inboxState.inboxFilters.filters  ← still { minPriority: null }
  API call: no minPriority param → returns ALL emails including priority=28
```

### Why localStorage Doesn't Save Us

`useInboxFilters` persists to localStorage under key `inbox_filters`. Both instances
read localStorage on mount. But the second instance in `Inbox.tsx` saves
`{ minPriority: 50 }` while the first instance inside `useInboxState` was already
constructed from the same localStorage value — except **`useInboxState` is constructed
before `filterState`**, and neither receives updates from the other after construction.

---

## Evidence in Code

- `client/src/pages/Inbox.tsx` line 230: `const filterState = useInboxFilters();`
- `client/src/hooks/useInboxState.ts` line 62: `const inboxFilters = useInboxFilters();`
- `client/src/pages/Inbox.tsx` line 139: `onFilterChange={fetchEmails}` — wires
  filterState's change callback to inboxState's fetchEmails
- `client/src/pages/Inbox.tsx` lines 86–88: destructures `filters, setPriorityFilter`
  etc. from `filterState`, not from `inboxState.inboxFilters`
- `client/src/hooks/useEmailFetching.ts` line 152: builds summary params from `filters`
  (inboxState closure) not from filterState

---

## Fix Plan

### Option A — Lift filter state out of `useInboxState` (Recommended)

Remove the `useInboxFilters()` call from inside `useInboxState`. Instead, accept the
filter state as a parameter (or accept just `filters: InboxFilter`).

**Changes:**

1. **`useInboxState.ts`**: Remove `const inboxFilters = useInboxFilters()` (line 62).
   Accept `filters: InboxFilter` as a prop in `UseInboxStateOptions` (or accept the
   full `useInboxFilters` return value). Pass it down to all hooks that currently
   receive `inboxFilters.filters`.

2. **`Inbox.tsx`**: Create `filterState` first (already there at line 230). Pass
   `filterState.filters` (or the full `filterState`) into `useInboxState({ filters: filterState.filters })`.

   This ensures both `fetchEmails` closure and the filter UI read the **same** state object.

3. **`useEmailManagement.ts`**, **`useEmailFetching.ts`**: No changes needed — they
   already accept `filters` as a prop.

4. **`useInboxInitialization.ts`**, **`useInboxModeChanges.ts`**: No changes needed —
   they already accept `filters` as a prop.

**Why this is the right fix:**

- Single source of truth for filter state
- No stale closures possible — `fetchEmails` always reads the current filter object
- The `overrideFilters` workaround in `handlePriorityChange` becomes unnecessary
  (though harmless to keep as defense-in-depth)
- No new abstractions required — just reorder instantiation and pass the state down

### Option B — Share the single `useInboxFilters` instance via context

Create a React context for inbox filters. `useInboxState` reads from the context
instead of instantiating its own `useInboxFilters`. `Inbox.tsx` provides the context.

**Not recommended** — adds complexity (context provider, consumer hooks) for a problem
that Option A solves with a simple prop plumbing change.

### Option C — Replace `overrideFilters` with a ref

In `useEmailFetching`, store `filters` in a ref that is updated synchronously on every
render. `fetchEmails` reads from the ref, not the closure.

**Partially mitigates** the immediate-call case but still doesn't fix subsequent
`refreshInPlace` calls reading from the wrong instance.

---

## Recommended Implementation (Option A)

### Step 1: Update `UseInboxStateOptions` in `useInboxState.ts`

```typescript
interface UseInboxStateOptions {
  isFocusedMode?: boolean;
  filters: InboxFilter; // ← add this
}
```

### Step 2: Remove internal `useInboxFilters()` call

```typescript
// REMOVE: const inboxFilters = useInboxFilters();
// USE the passed-in filters everywhere inboxFilters.filters was used
```

But we still need to expose `inboxFilters` in the return value (for `setPriorityFilter`,
`clearFilters`, etc.). These can be passed down from `Inbox.tsx` where `filterState`
is already available.

Actually the cleanest approach: pass the entire `filterState` (type
`ReturnType<typeof useInboxFilters>`) into `useInboxState`:

```typescript
interface UseInboxStateOptions {
  isFocusedMode?: boolean;
  inboxFilters: ReturnType<typeof useInboxFilters>;
}
```

### Step 3: In `Inbox.tsx`, instantiate `filterState` before `inboxState`

```typescript
const Inbox: React.FC = () => {
  const filterState = useInboxFilters();  // ← FIRST
  const inboxState = useInboxState({ inboxFilters: filterState });  // ← SECOND, receives filterState
  ...
};
```

### Step 4: Remove the duplicate `useInboxFilters()` from `InboxView` signature

`InboxView` currently receives `filterState` as a separate prop from `inboxState`.
After the fix, `inboxState.inboxFilters === filterState` (same object reference), so
the prop is still needed for InboxView — just ensure it comes from the same source.

---

## Files to Change

| File                                         | Change                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `client/src/pages/Inbox.tsx`                 | Move `filterState = useInboxFilters()` before `useInboxState()`, pass it as prop        |
| `client/src/hooks/useInboxState.ts`          | Accept `inboxFilters` as option param instead of calling `useInboxFilters()` internally |
| `client/src/hooks/useEmailFetching.ts`       | No change needed (already accepts `filters` as prop)                                    |
| `client/src/hooks/useEmailManagement.ts`     | No change needed                                                                        |
| `client/src/hooks/useInboxInitialization.ts` | No change needed                                                                        |
| `client/src/hooks/useInboxModeChanges.ts`    | No change needed                                                                        |

---

## Testing

1. Set priority filter to "Very High (>50)".
2. Verify emails with priority < 50 do not appear.
3. Trigger a background refresh (wait 60s for TTL, or navigate away and back).
4. Verify emails with priority < 50 still do not appear after refresh.
5. Change filter from "Very High" to "All" — verify all emails return.
6. Change filter to "Medium (15-30)" — verify only 15-30 range emails appear.
7. Reload the page with "Very High" still in localStorage — verify filter persists and emails are filtered on first load.

---

## Related

- PR #1166: fixed intra-instance stale closure (overrideFilters workaround) — partial fix
- Issue #1165: original stale closure (selecting "High" sent old minPriority) — fixed
- Issue #1164: badge ghost count — fixed

---

_Authored by Monk of Modularity — investigation only, no code changes in this PR._
