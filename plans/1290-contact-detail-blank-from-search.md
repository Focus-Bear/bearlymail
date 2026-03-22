# Plan: Fix blank screen on contact detail page from CRM search

**Issue:** #1290
**Author:** Monk of Modularity (OpenClaw)

## Problem

When a user searches for contacts in the CRM page and clicks a result that
originates from Gmail (not yet synced to the local DB), the contact detail
page loads a blank screen.

## Root Cause

### Search returns Gmail-sourced contacts with non-UUID `id`

`contacts.service.ts` → `searchContacts()` merges local DB contacts with
results from `gmailContactsProvider.searchContacts()`. For Gmail-sourced
contacts that have no local DB record, the result sets:

```ts
id: raw.providerId,  // e.g. "people/c12345678901234567"
```

### Navigation breaks due to slash in ID

`Contacts.tsx` navigates on click:
```ts
navigate(`/crm/contacts/${contact.id}`)
// → navigate('/crm/contacts/people/c12345678901234567')
```

The route is defined as:
```tsx
<Route path="/crm/contacts/:contactId" element={...} />
```

React Router v6 treats `/` as a path separator. The URL
`/crm/contacts/people/c12345678901234567` has **4 segments**, but the route
pattern expects **3 segments** (`crm/contacts/:contactId`). The route doesn't
match → falls through to NotFound (or renders nothing) → **blank screen**.

### Even if routing matched, the API would fail

`getContactDetail()` does:
```ts
const contact = await this.contactRepository.findOne({
  where: { id: contactId, userId },
});
if (!contact) throw new NotFoundException("Contact not found");
```

A Google People API resource name like `"people/c12345..."` is not a valid UUID
and would never match a DB record.

## Fix

### Step 1: Prevent navigation for contacts without a local DB ID

In `Contacts.tsx`, the search results already check `contact.id` before
navigating. The problem is that Gmail-sourced contacts DO have an `id` — it's
just not a valid DB UUID. We need to distinguish local vs external contacts.

**Option A (recommended):** Add a flag to the search result indicating whether
the contact exists locally:

```ts
// In ContactSearchResult (server)
isLocal?: boolean;

// In searchContacts (server) — mark Gmail-only results
for (const raw of filteredGmailResults) {
  const key = raw.email.toLowerCase();
  if (!results.has(key)) {
    results.set(key, {
      id: raw.providerId,
      // ... other fields ...
      isLocal: false,   // ← new field
    });
  }
}
// Local contacts get isLocal: true in toSearchResult()
```

```ts
// In Contacts.tsx
onClick={() => contact.isLocal && contact.id && navigate(`/crm/contacts/${contact.id}`)}
```

**Option B (simpler, faster):** Validate the `id` format client-side before
navigating. UUIDs match a known pattern; Google resource names start with
`"people/"`:

```ts
const isValidDbId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

onClick={() => contact.id && isValidDbId(contact.id) && navigate(`/crm/contacts/${contact.id}`)}
```

This is fragile if the DB ever uses non-UUID primary keys.

**Option C (most complete):** Auto-create a local contact record when a Gmail-only
search result is clicked. This is more complex but provides the best UX:

```ts
// Client: POST /contacts/from-gmail { email, providerId }
// Server: upsert a Contact row, return the DB UUID
// Client: navigate to /crm/contacts/<uuid>
```

### Step 2: Show a meaningful state for non-navigable contacts

For contacts that can't be navigated to (Gmail-only, no local record), either:
- Show a tooltip: "Sync contacts to view details"
- Show a different cursor (`default` instead of `pointer`)
- Show a mini detail popover inline

### Recommended approach: Option A + Step 2

This clearly communicates which contacts are clickable and why. It also
future-proofs the search result API for other consumers.

## Files to Change

| File | Change |
|------|--------|
| `server/src/contacts/contacts.service.ts` | Add `isLocal` field to `ContactSearchResult`; set `true` in `toSearchResult()`, `false` for Gmail-only |
| `client/src/types/contact.ts` | Add `isLocal?: boolean` to `Contact` interface |
| `client/src/pages/Contacts.tsx` | Gate navigation on `contact.isLocal` |
| `client/src/hooks/useContactSearch.ts` | No changes needed (passes through results) |

### Defensive hardening (optional but recommended)

| File | Change |
|------|--------|
| `client/src/pages/contact-detail/hooks/useContactDetailData.tsx` | Validate `contactId` format before API call; show "Invalid contact" for non-UUID IDs |
| `client/src/App.tsx` | Consider adding a catch-all or wildcard sub-route under `/crm/contacts/` to handle malformed IDs gracefully |

## Testing

1. Search for a contact that exists only in Gmail (not synced locally).
2. Verify the contact row shows non-clickable styling (no pointer cursor).
3. Click it — verify no navigation occurs (or a helpful message appears).
4. Search for a locally-synced contact — verify click navigates correctly.
5. Directly visit `/crm/contacts/people/c12345` — verify a proper error page
   renders instead of blank screen.

## Risk Assessment

- **Low risk.** The server-side change is additive (new field). The client change
  narrows an existing click handler.
- If `isLocal` is omitted from the response (older server version), the field
  defaults to `undefined` which is falsy — navigation would be blocked for all
  search results. To handle this gracefully, default `isLocal` to `true` on the
  client when undefined:
  ```ts
  const canNavigate = contact.id && (contact.isLocal !== false);
  ```
