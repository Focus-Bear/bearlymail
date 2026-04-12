# Plan: Fix clicking contact in CRM list does nothing

## Bug Summary

On `/crm/contacts`, clicking a contact row does nothing. Expected: navigate to `/crm/contacts/:id` detail page.

## Root Cause Analysis

### Click handler location

- **File:** `client/src/pages/Contacts.tsx`, `ContactsList` component
- **Lines ~117-125** — the `onClick` handler on each contact row div

### What the handler does

```tsx
onClick={() => {
  const canNavigate = contact.id && contact.isLocal !== false;
  if (canNavigate) {
    navigate(`/crm/contacts/${contact.id}`);
  }
}}
```

### Route confirmation

- `client/src/App.tsx` line 186: `<Route path="/crm/contacts/:contactId">` — correctly defined
- `client/src/pages/ContactDetail.tsx` — exists and renders properly

### The problem: `useContactSearch` replaces the entire contact list with search results

**File:** `client/src/hooks/useContactSearch.ts`, line ~120

```tsx
const filteredContacts = useCallback(
  (baseContacts: Contact[]): Contact[] =>
    searchResults.length > 0 ? searchResults : baseContacts,
  [searchResults],
);
```

The `searchContacts()` function triggers on any query ≥ 2 chars and calls `GET /contacts/search`. The search endpoint returns a **mix** of:

1. **Local contacts** (`isLocal: true`, UUID id) — navigable ✅
2. **Gmail-only contacts** (`isLocal: false`, id = Google People API resource name like `people/c12345`) — silently non-navigable ❌

When search results are showing, Gmail-only contacts fail the navigation guard silently — no cursor change and no feedback beyond `cursor: default`.

### Secondary issue: `GET /contacts` always returns local contacts only

The main `GET /contacts` endpoint (`getAllContacts`) only queries the local DB and always sets `isLocal: true`. So the base contact list (before any search) **should** be fully navigable.

**Hypothesis:** If the base list works but search results don't, the bug manifests only when searching. If the base list also fails, there may be a runtime data issue (contacts loaded without `id`, or `isLocal` missing from the response).

### Server data flow

- `GET /contacts` → `getAllContacts()` → `toSearchResult()` — always sets `isLocal: true` with UUID id
- `GET /contacts/search` → `searchContacts()` — returns mix of local (`isLocal: true`) and Gmail-only (`isLocal: false`)

### Git history

- `Contacts.tsx` and `useContactSearch.ts` were created in the initial commit (`0114c6c`) — no subsequent modifications
- No recent changes to the CRM contacts area

## Proposed Fix

### 1. Add visual feedback for non-navigable contacts (primary fix)

**File:** `client/src/pages/Contacts.tsx`, `ContactsList` component, lines ~117-145

- Add a tooltip or small badge on Gmail-only contacts explaining "Sync to view details"
- Keep the `cursor: default` but add `opacity: 0.7` to visually distinguish
- Consider adding an `onClick` handler that shows a toast: "This contact hasn't been synced yet"

### 2. Fix `filteredContacts` to preserve local contacts over search results

**File:** `client/src/hooks/useContactSearch.ts`, `filteredContacts` callback

Current behavior replaces the entire list. Consider:

- Merging search results with base contacts (prefer local over Gmail-only)
- Or marking Gmail-only results visually so users understand the difference

### 3. Verify runtime data from `GET /contacts`

- Add a console.warn or Sentry breadcrumb when `canNavigate` is false in the click handler
- This will help diagnose whether the base list (non-search) is also affected

## Files to Modify

| File                                   | Lines    | Change                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------- |
| `client/src/pages/Contacts.tsx`        | ~117-125 | Add user feedback when click is blocked (toast/tooltip) |
| `client/src/pages/Contacts.tsx`        | ~130-145 | Add visual indicator for non-navigable contacts         |
| `client/src/hooks/useContactSearch.ts` | ~118-121 | Consider filtering or marking Gmail-only results        |

## Testing

1. Load `/crm/contacts` with synced contacts → clicking any row should navigate to detail
2. Search for a contact → local results should be navigable, Gmail-only should show feedback
3. Verify `GET /contacts` returns `isLocal: true` for all contacts

---

_Investigation by Monk of Modularity 🧘_
_Proposed fix ready for Captain Codebeard 🏴‍☠️_
