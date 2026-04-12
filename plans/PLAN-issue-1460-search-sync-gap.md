# Plan: Fix search showing "No emails found" despite Gmail returning results

**Issue:** #1460
**Author:** Monk of Modularity 🧘 (AI agent)
**Status:** Plan PR — no code changes

---

## Problem Summary

When a user searches for a term (e.g. "venodi"), Gmail returns 50 matching message IDs but the UI shows "No emails found" alongside "Search queries used: venodi [gmail] (50 results)".

## Root Cause

The Phase 1 search fast path (`skipLlm=true`) also sets `skipSync=true`, which prevents on-demand syncing of emails that exist in Gmail but haven't been indexed in BearlyMail's local database. The subsequent phases (Phase 2 ranking, Phase 3 expansion) cannot recover because they only operate on emails already returned by Phase 1.

### Detailed Flow

```
Frontend: GET /emails/search?q=venodi&maxResults=50&skipLlm=true
  → Controller: skipLlmRanking=true, skipLlmFallback=true, skipSync=true
  → searchAllProviders(): Gmail API returns 50 message IDs ✅
  → fetchMatchedDbEmails(): 0 of 50 message IDs exist in local DB ❌
  → skipSync=true → return { emails: [] } immediately (no sync attempt)
  → matchedEmails.length === 0 → return "No matching emails found" marker
  → Frontend shows: "No emails found" + "venodi [gmail] (50 results)"
```

Phase 2 (`POST /emails/search/rank`) receives empty `emailIds[]` from frontend → nothing to rank.
Phase 3 (`POST /emails/search/expand`) generates alternative queries but also only matches against local DB → same gap.

## Fix Approach

### Option A: Decouple `skipSync` from `skipLlm` (Recommended)

**Rationale:** The performance concern behind `skipSync` is valid — syncing 50 threads inline would blow the 2s budget. But we can do a **bounded sync** of the most relevant threads without breaking the budget.

#### Changes Required

**1. `server/src/emails/emails.controller.ts` (line ~315-320)**

- Stop coupling `skipSync` to `skipLlm`
- Instead, always allow sync but with a small cap when in fast-path mode

```typescript
// Current (broken):
skipSync: skipLlmRanking,

// Fix:
skipSync: false,  // Always allow sync; service caps thread count
```

**2. `server/src/emails/email-search.service.ts` — `syncAndFetchMatchedEmails()`**

- When Phase 1 (fast path), limit sync to the top N threads (e.g. 5-10) instead of the current MAX_THREADS_TO_SYNC (10)
- This keeps sync bounded while still returning some results
- Add a `maxSyncThreads` option to `SearchEmailsOptions` for fine-grained control

```typescript
// In syncAndFetchMatchedEmails:
const syncLimit = options?.maxSyncThreads ?? MAX_THREADS_TO_SYNC;
const threadIds = [...threadIdSet].slice(0, syncLimit);
```

**3. `server/src/emails/email-search.service.ts` — `searchEmails()`**

- Pass `maxSyncThreads: 5` when in fast-path mode to keep Phase 1 bounded
- This syncs up to 5 threads (~1-2s) and returns those results immediately

#### Why not just remove `skipSync`?

The existing `MAX_THREADS_TO_SYNC = 10` already caps sync work. The real issue is that `skipSync=true` prevents ANY sync, even bounded. By always syncing (with a smaller cap in Phase 1), we get results for the most relevant threads while staying within budget.

### Option B: Add a Phase 1.5 sync step (Alternative)

Add a new endpoint `POST /emails/search/sync` that:

1. Receives the raw Gmail message IDs from Phase 1
2. Syncs them to local DB
3. Returns the synced emails

Frontend would call: Phase 1 → Phase 1.5 (sync) → Phase 2 (rank)

**Pros:** Clean separation, doesn't change Phase 1 contract
**Cons:** Extra network round-trip, more frontend complexity

### Recommendation: Option A

Option A is simpler, requires fewer changes, and the existing sync infrastructure already handles the bounded case. The `MAX_THREADS_TO_SYNC` cap means we won't block indefinitely.

## Files to Change

| File                                        | Change                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| `server/src/emails/emails.controller.ts`    | Stop passing `skipSync: skipLlmRanking`                 |
| `server/src/emails/email-search.service.ts` | Add `maxSyncThreads` option; use smaller cap in Phase 1 |
| `server/src/emails/email-search.types.ts`   | Add `maxSyncThreads` to `SearchEmailsOptions`           |

## Edge Cases

1. **All 50 Gmail results are already synced** — No sync needed, existing path works. No change in behavior.
2. **None of the 50 results are synced** — Syncs top 5 threads, returns those. User sees partial results immediately, can refine.
3. **Sync fails** — Existing error handling catches sync failures gracefully. Returns "Emails found in your email provider but could not be synced" message.
4. **Very slow network / Gmail API** — The 5-thread cap bounds the worst case. Even if each thread takes 500ms, that's 2.5s — acceptable for Phase 1 when it means showing results vs. showing nothing.
5. **Provider has no `syncEmails` method** — The existing null-check on provider handles this.
6. **`queriesTried` count vs actual results** — After the fix, queriesTried will still show "50 results" (from Gmail) but the actual rendered count might be 5-10 (synced subset). This is acceptable — the user sees some results immediately and more after background sync. Consider adding a UI hint: "Showing X of Y results. More will appear after sync."

## Testing

- Unit test: `syncAndFetchMatchedEmails` with `maxSyncThreads` option
- Integration: Search for a term that exists in Gmail but not local DB → verify results are returned
- E2E: Existing search e2e tests should still pass (they use seeded data)

## Performance Impact

- Phase 1 goes from ~200ms (no sync, no results) to ~1-2.5s (sync 5 threads, show results)
- This is within the 2s budget for most cases and vastly better UX than showing "No results"
- Phase 2/3 remain unchanged

---

## ⚠️ Architectural Direction Change (post-implementation note)

After this fix was implemented, Jeremy clarified a better long-term approach:

> "Why do we need to sync emails? Can't we just immediately show the results in the UI?"

**Proposed approach:**

1. Gmail search returns message IDs + metadata (subject, from, date, snippet) — show these **immediately** in the UI without waiting for sync
2. Render unsynced search results in a lightweight format (subject/sender/date/snippet from Gmail API)
3. Sync/AI-enrich those threads in the **background**
4. UI updates in-place as enrichment completes (add priority badge, category, summary)

This means the backend `/emails/search` endpoint needs to return a **mixed result type**:

- Locally stored emails (fully enriched, current shape)
- Gmail-only results (raw metadata, marked `synced: false`)

And the frontend needs to render both types with a subtle "pending" indicator on unsynced ones.

**Why this wasn't done in this PR:**
This requires changes to the search endpoint return type, a new `UnsyncedSearchResult` DTO, frontend rendering logic for mixed results, and a background enrichment trigger. That's a significant cross-cutting change that warrants a dedicated plan PR.

**Filed as issue for Monk to plan:** The current `maxSyncThreads: 5` approach is correct for the immediate fix (stops the "No results" regression) but should be superseded by the raw-metadata approach above.

**Suggested next issue:** "Search should return raw Gmail metadata immediately without waiting for sync — enrich in background"
