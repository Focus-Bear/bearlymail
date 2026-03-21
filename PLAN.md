# Plan: Fix GET /emails/{threadId} Returns 500 via /inbox/thread/{id} URL (#1296)

**Issue:** #1296  
**Branch:** monk-plan/issue-1296  
**Severity:** Medium — email view shows "Email not found" when navigating via thread URL  
**Filed by:** professor-reproducible (QA run 2026-03-20)

---

## Root Cause Analysis

### The URL Pattern

The QA evidence shows the user navigated to:
```
https://app.bearlymail.com/inbox/thread/19d03cdabc72da73
```

The React Router config in `App.tsx` has:
```typescript
<Route path="/inbox/:mode/:threadId" element={<PrivateRoute><Inbox /></PrivateRoute>} />
```

So `/inbox/thread/19d03cdabc72da73` matches with:
- `mode = "thread"` (NOT a valid inbox mode)
- `threadId = "19d03cdabc72da73"` (a Gmail thread ID in hex format)

### What Happens Next

In `useInboxUrlSync` (Effect 1 — mount only):
```typescript
if (urlThreadId && splitViewSelectedEmailId !== urlThreadId) {
  openEmail(urlThreadId);  // opens with Gmail threadId "19d03cdabc72da73"
}
if (!urlMode) { ... }  // urlMode IS set ("thread") — no redirect
```

`openEmail("19d03cdabc72da73")` → `splitView.openEmail("19d03cdabc72da73")` → `splitView.selectedEmailId = "19d03cdabc72da73"`.

Then `EmailDetail` renders with `emailId = "19d03cdabc72da73"`.

### The 500 Error

`useEmailDetailFetching` fires:
```typescript
const response = await axios.get(`${API_URL}/emails/19d03cdabc72da73`);
```

The NestJS controller calls:
```typescript
// emails.controller.ts
const email = await this.emailsService.getEmailById(userId, id);
```

Which calls:
```typescript
// email-crud.service.ts
return this.emailRepository.findOne({ where: { id: emailId, userId } });
```

The `Email.id` column is `@PrimaryGeneratedColumn("uuid")` — it expects a UUID format like `04547756-9d11-42b4-beae-227d52377fcd`. When PostgreSQL tries to cast `19d03cdabc72da73` (a Gmail thread ID, hex format without dashes) to UUID, it throws:
```
QueryFailedError: invalid input syntax for type uuid: "19d03cdabc72da73"
```

This becomes an unhandled 500, and the front-end shows "Email not found".

The second 500 (`GET /github/emails/19d03cdabc72da73`) is triggered by `GitHubProjectBadges` in the email detail view, which also calls `getEmailById` internally — same root cause.

### Why Was This URL Generated?

The URL `/inbox/thread/{id}` doesn't match any intentional route. Likely causes:
1. **Old link format** — a previous version of the app may have used `/inbox/thread/{gmailThreadId}` before the current `/inbox/:mode/:threadId` (UUID-based) format was introduced
2. **External link sharing** — a user copied the URL while the split view was open with a Gmail thread ID in the URL bar (before the fix for #1191 that changed URL format)
3. **Bookmark** — a user bookmarked a URL from an older session

The correct URL format for an email is:
```
/inbox/triage/04547756-9d11-42b4-beae-227d52377fcd  (internal UUID)
```

But the problematic URL has the Gmail hex threadId instead of the internal UUID.

### Why Does the Same Email Work at `/inbox/email/{emailId}`?

The evidence shows the email loads correctly at:
```
/inbox/email/04547756-9d11-42b4-beae-227d52377fcd
```

This would match route `/inbox/:mode` with `mode = "email"` — but `/inbox/email/...` is not in the router config. Actually looking at the App.tsx routes, there is no `/inbox/email/:id` route. The user may have been testing with a direct `/email/:id` route:
```
/email/04547756-9d11-42b4-beae-227d52377fcd  (matches Route path="/email/:id")
```

---

## Two-Part Fix

### Part 1: Server-side — Add UUID Validation Guard in `getEmailOrThrow`

**File:** `server/src/emails/emails.controller.ts`

Add a UUID format validation before calling `getEmailById`. If the `id` param is not a valid UUID, return 404 (not 500):

```typescript
private async getEmailOrThrow(userId: string, id: string): Promise<Email> {
  // Fix #1296: reject non-UUID ids immediately to prevent PostgreSQL cast errors.
  // Gmail thread IDs are hex strings without dashes (e.g. "19d03cdabc72da73");
  // internal email IDs are UUIDs (e.g. "04547756-9d11-42b4-beae-227d52377fcd").
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    throw new NotFoundException(`Email not found`);
  }
  const email = await this.emailsService.getEmailById(userId, id);
  if (!email) throw new NotFoundException('Email not found');
  return email;
}
```

Also add the same guard in `github.controller.ts` `getEmailGitHubInfo` handler (which is separately called and also 500s).

**Note:** Change the thrown `Error` to `NotFoundException` (from `@nestjs/common`) so NestJS returns a proper 404 JSON response instead of an unhandled 500.

### Part 2: Client-side — Handle Thread ID vs Email ID in URL Sync

**File:** `client/src/hooks/useInboxUrlSync.ts`

The `urlThreadId` from the URL parameter can be:
- An internal email UUID (correct format — this is what `openEmail` expects)
- A Gmail thread ID in hex format (legacy/incorrect — should not be passed to `openEmail`)

Add a validation check before calling `openEmail`:

```typescript
// Fix #1296: Only treat the URL segment as an email ID if it looks like a UUID.
// Gmail thread IDs are 16-char hex strings without dashes. If the URL contains
// a Gmail thread ID (e.g. from an old link), log a warning and do not attempt
// to open it as an email — it would produce a 500 from the API.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Effect 1 — mount:
if (urlThreadId && splitViewSelectedEmailId !== urlThreadId) {
  if (UUID_REGEX.test(urlThreadId)) {
    openEmail(urlThreadId);
  } else {
    console.warn('[useInboxUrlSync] urlThreadId does not look like a UUID, ignoring:', urlThreadId);
  }
}

// Effect 3 — URL change:
if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
  if (UUID_REGEX.test(urlThreadId)) {
    openEmail(urlThreadId);
  } else {
    console.warn('[useInboxUrlSync] urlThreadId does not look like a UUID, ignoring:', urlThreadId);
  }
}
```

### Part 3 (Optional Enhancement): Thread-ID Lookup Fallback

If we want to support legacy `/inbox/thread/{gmailThreadId}` links gracefully (rather than silently ignoring them), we could add a lookup endpoint or client-side resolution:

**Server route:** `GET /emails/by-thread-id/:threadId` → looks up by `thread_id` column and returns the email UUID.

**Client:** When `urlThreadId` is not a UUID, call `GET /emails/by-thread-id/{threadId}` to resolve the Gmail threadId to an internal email UUID, then call `openEmail(resolvedUUID)`.

This is more complex and out of scope for the immediate fix. The priority is stopping the 500.

---

## Files to Change

| File | Change |
|------|--------|
| `server/src/emails/emails.controller.ts` | UUID validation guard in `getEmailOrThrow`; change `Error` → `NotFoundException` |
| `server/src/github/github.controller.ts` | UUID validation guard in `getEmailGitHubInfo` |
| `client/src/hooks/useInboxUrlSync.ts` | UUID format check before calling `openEmail` |

---

## Test Plan

1. **Server unit test** (`emails.controller.spec.ts`):
   - `GET /emails/19d03cdabc72da73` → 404 (not 500)
   - `GET /emails/not-a-uuid` → 404
   - `GET /emails/04547756-9d11-42b4-beae-227d52377fcd` → 200 (existing test passes)

2. **Manual QA:**
   - Navigate to `https://app.bearlymail.com/inbox/thread/19d03cdabc72da73`
   - Assert: no 500 error in network tab
   - Assert: inbox loads (without error crash), "Email not found" gracefully handled or ignored

3. **Regression:** Navigate to `https://app.bearlymail.com/inbox/triage/{validUUID}` — email detail should still open correctly

---

## Estimated Effort

- Small (1–2 hours): UUID guard on server + client URL sync check
- Optional thread-ID lookup fallback: ~3–4 hours (separate PR)

---

*Planned by Monk of Modularity — 2026-03-20*
