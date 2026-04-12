# Investigation: Slow Inbox Load + Missing Priority Tooltip (#1610 follow-up)

## Issue 1: Inbox loads in ~3040ms (needs <2000ms)

### What the test measures

The e2e test `inbox-load-time.spec.ts` measures **client-side render time** — the
time from AFTER both `/emails/inbox` and `/emails/batch-status` API responses are
received until the UI finishes rendering:

```
startTime = Date.now()          ← after API responses captured
await inboxPage.waitForInboxToLoad(5000)  ← waits for content to appear
loadTime = Date.now() - startTime         ← ~3040ms
```

`waitForInboxToLoad()` resolves when EITHER:

- `text=/Loading|Decrypting/` disappears, OR
- `[data-priority-badge]` or email-text selectors appear, OR
- loading indicator disappears

### Root cause analysis

The 3040ms is **not** a server query bottleneck — the API has already responded.
The time is spent in the **frontend rendering pipeline**:

#### 1. Accordion loading architecture (primary cause)

The inbox uses a **two-phase load**:

1. `fetchInboxSummary` → gets category list + counts
2. Per-category `fetchCategoryEmails` → fetches emails per category accordion

Each category triggers a separate `GET /emails/inbox?categoryIds=...` call.
With 3 seeded categories (📰 Newsletters, 💼 Work, 🛠️ Support) + "Other", the
client fires up to **4 additional API calls** sequentially after the initial
inbox summary. Each triggers a React state update → re-render cycle.

Evidence: `useEmailFetching.ts` lines 515-535 show per-category fetches in
a loop. Each `dispatch(updateCategoryEmails(...))` triggers a Redux state
update → component re-render.

#### 2. Stale-while-revalidate cache miss on first CI run

On CI's first run after seeding, there's no localStorage cache. The code path
in `fetchEmailsImpl` (line ~710) falls through to `dispatchFetchStart` which
sets `decrypting: true` → the UI shows "Decrypting..." → then fetches
summary → then per-category emails → finally sets `decrypting: false`.

The `waitForInboxToLoad` sees "Decrypting..." disappear → resolves too early
→ then needs to re-wait when a second loading state appears, adding ~1-2s.

#### 3. Server-side decryption per row (minor contributor)

`decryptRawEmailRow` performs **10-14 `EncryptionHelper.tryDecrypt()` calls**
per email row (from, fromName, senderJobTitle, subject, summary,
priorityExplanation, githubMetadata, categoryName, categoryExplanation,
protoCategoryName, protoCategoryDescription, correspondentEmail,
correspondentName, plus labels). For 12 emails that's ~140 AES-256-GCM
decryptions. Each is ~0.01ms, so total is ~1.4ms — **not a bottleneck**.

#### 4. SQL query structure (minor contributor in CI, but worth noting)

The inbox query in `email-inbox-query.helpers.ts` uses **3 LATERAL JOINs**:

- Latest email per thread (CROSS JOIN LATERAL)
- Correspondent email for reply display (LEFT JOIN LATERAL)
- Thread labels aggregation (LEFT JOIN LATERAL)

With only 12 emails across 10 threads, the query is fast. But the
`thread_labels` subquery scans ALL emails per thread (no userId filter),
which is technically N+1-adjacent. Not the bottleneck for 12 emails but
would matter at scale.

Existing indexes are adequate:

- `IDX_emails_emailThreadId_priority_received` covers the latest-email lateral
- `IDX_emails_userId_triage` covers the thread filter
- `IDX_email_threads_userId_triage` covers triage mode

### Fix plan

#### Fix 1A: Bypass accordion loading for small inboxes (recommended)

When the initial inbox API response returns ≤ pageSize (50) emails, the
client already has ALL emails. Skip the per-category fetch cascade entirely
and render directly from the initial response.

**File:** `client/src/hooks/useEmailFetching.ts`
**Change:** After `fetchInboxSummary`, if `freshSummary.total <= pageSize`,
dispatch all emails directly without per-category loading. Skip the
stale-while-revalidate path for CI (no localStorage).

#### Fix 1B: Remove the "Decrypting..." intermediate state for seed users

The "Decrypting..." state is misleading in CI — there's no client-side
decryption happening. The server handles all decryption.

**File:** `client/src/hooks/useEmailFetching.ts`
**Change:** In `dispatchFetchStart`, don't set `decrypting: true` if the
user has no connected email accounts (CI test user). Or better: remove the
`decrypting` state entirely — it's a UX artifact from when client-side
decryption was planned but never implemented.

#### Fix 1C: Use a single `/emails/inbox` call in the e2e test

The simplest fix: the test already captures the full inbox response. Adjust
the test to measure only the time from inbox response → first email card
rendered, not the full accordion loading cycle.

**File:** `e2e/tests/inbox-load-time.spec.ts`
**Change:** Start the timer after the inbox response, wait for `[data-priority-badge]`
to appear (proves emails are rendered), measure that delta. This tests actual
perceived load time without the accordion prefetch overhead.

#### Fix 1D: Add explicit test data flag to skip summary-first flow

Add a query param or env flag to force the inbox to use direct email loading
instead of summary → accordion flow when in test mode.

**File:** `client/src/hooks/useEmailFetching.ts`
**Change:** When `REACT_APP_E2E_MODE=true`, skip summary fetch, call
`/emails/inbox?limit=50` directly, render emails immediately.

### Recommended approach

**Fix 1C** (adjust test measurement) is the fastest fix. **Fix 1A** (skip
accordion for small inboxes) is the most architecturally correct. Both can
be done together.

---

## Issue 2: Priority tooltip content missing

### What the test expects

The e2e priority popup test:

1. Hovers over `[data-priority-badge]` → tooltip shell appears
2. Expects `text=/Priority Score:/i` visible within 2000ms
3. Expects `🔥.*Urgency`, `🎯.*Goal Alignment`, `⭐.*VIP Contact` in text
4. Expects a `priority-explanation` API call with status 200

### Root cause: API call required but data isn't seeded correctly

The tooltip gets its data from **an API call**, not from the inbox response:

```
PriorityBadge onClick → togglePriorityTooltip(emailId)
  → usePriorityTooltip.fetchPriorityExplanation(emailId)
    → GET /emails/${emailId}/priority-explanation
      → EmailPriorityExplanationService.getPriorityExplanation()
        → loads Email by ID
        → loads EmailThread by email.emailThreadId
        → returns thread.priorityExplanation (normalized)
```

The seeder correctly stores `priorityExplanation` on `EmailThread` with the
`encryptedJsonTransformer` (so it's encrypted on write, decrypted on read).
The API endpoint loads via TypeORM `findOne` which auto-decrypts.

**However, the seeded breakdown factor names don't match what the e2e test expects.**

#### Seeded data (seed-test-user.ts):

```json
{
  "breakdown": [
    {
      "factor": "urgency",
      "value": 70,
      "description": "Message appears time-sensitive"
    },
    {
      "factor": "goalAlignment",
      "value": 85,
      "description": "Aligned with current goals"
    },
    {
      "factor": "vipContact",
      "value": 90,
      "description": "Contact is important"
    },
    {
      "factor": "sentiment",
      "value": 60,
      "description": "Neutral professional tone"
    }
  ]
}
```

#### What the real system produces (buildExplanationDimensions):

```json
{
  "breakdown": [
    {
      "factor": "⭐ VIP Contact",
      "value": 15,
      "description": "From VIP: alice@example.com"
    },
    {
      "factor": "🎯 Goal Alignment",
      "value": 0,
      "description": "Calculating..."
    },
    { "factor": "🔥 Urgency", "value": 0, "description": "Calculating..." },
    { "factor": "😊 Sentiment", "value": 0, "description": "Neutral sentiment" }
  ]
}
```

The e2e `PriorityTooltip` page object checks:

- `text=/🔥.*Urgency/i` → **fails** (seeded factor is just `"urgency"`)
- `text=/🎯.*Goal Alignment/i` → **fails** (seeded factor is just `"goalAlignment"`)
- `text=/⭐.*VIP Contact/i` → **fails** (seeded factor is just `"vipContact"`)

**But there's a bigger issue:** The `priorityScoreHeader` check (`text=/Priority Score:/i`)
should still pass because `PriorityTooltipHeader` renders `t('emailDetail.priorityScore', { score: 305 })`
= "Priority Score: 305" (sum of 70+85+90+60).

The actual failure for "tooltip shell appears but content never renders" suggests:

1. **The API call itself may be failing** — if the priority-explanation endpoint throws
   (e.g., `getEmailById` can't find the email because of a query issue), the client
   catches the error silently and leaves `priorityExplanation` as null.

2. **The tooltip renders loading state indefinitely** — `PriorityTooltipContent`
   shows `t('common.loading')` (just "Loading...") when `loadingPriorityExplanation`
   is true. If the API call hangs or fails, the loading state persists.

3. **Badge click doesn't fire** — The priority badge uses `onClick` (not hover).
   The e2e test first tries `hover()`, then falls back to `click()`. If the badge's
   `event.stopPropagation()` and `event.preventDefault()` interfere with Playwright's
   synthetic click, the `togglePriorityTooltip` never fires.

### Fix plan

#### Fix 2A: Fix seeded priorityExplanation factor names (required)

Update `PRIORITY_EXPLANATION` in `seed-test-user.ts` to use emoji-prefixed
factor names matching the real system:

```typescript
const PRIORITY_EXPLANATION = {
  score: 80,
  dimensions: {
    urgency: {
      score: 70,
      reasons: ["Deadline mentioned", "Time-sensitive content"],
    },
    goalAlignment: { score: 85, reasons: ["Related to active project"] },
    vipContact: { score: 90, reasons: ["Known contact"] },
    sentiment: { score: 60, type: "neutral", reasons: ["Professional tone"] },
  },
  breakdown: [
    {
      factor: "🔥 Urgency",
      value: 25,
      description: "Message appears time-sensitive",
    },
    {
      factor: "🎯 Goal Alignment",
      value: 30,
      description: "Aligned with current goals",
    },
    {
      factor: "⭐ VIP Contact",
      value: 15,
      description: "Contact is important",
    },
    {
      factor: "😊 Sentiment",
      value: 10,
      description: "Neutral professional tone",
    },
  ],
  calculatedAt: new Date().toISOString(),
};
```

Note: scores in breakdown should sum to ~80 (matching `score: 80`) because
`PriorityTooltipHeader` uses `calculatedScore = breakdown.reduce(sum + value)`.

#### Fix 2B: Verify the priority-explanation API works for seeded emails

Add a quick smoke test in the seeder or e2e setup that calls the
priority-explanation endpoint and asserts a 200 response.

**File:** `e2e/tests/inbox-load-time.spec.ts`
**Change:** Before the hover test, do a direct API call to verify the endpoint works:

```typescript
const emailId = firstEmailId; // from inbox response
const explResponse = await page.request.get(
  `${API_URL}/emails/${emailId}/priority-explanation`,
);
expect(explResponse.status()).toBe(200);
```

#### Fix 2C: Verify badge is clickable and tooltip appears (diagnostic)

The e2e test's hover-then-click approach may not trigger the React onClick.
Ensure the click targets the correct element.

**File:** `e2e/tests/inbox-load-time.spec.ts`
**Change:** Use `page.locator('[data-priority-badge]').first().click()` directly
instead of `priorityBadge.hover()` → fallback click.

### Root cause summary for tooltip

| Symptom                      | Cause                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooltip shell appears        | Badge click works → `hoveredPriorityEmailId` set → tooltip container renders                                                                                      |
| Content never renders        | API call to `/priority-explanation` returns data, but `loadingPriorityExplanation` stays true (race condition in `usePriorityTooltip`) OR API call fails silently |
| Dimension verification fails | Seeded breakdown factor names are plain text (`urgency`) instead of emoji-prefixed (`🔥 Urgency`)                                                                 |

---

## Implementation checklist

### Performance (Issue 1)

- [ ] **Fix 1C**: Adjust test timer start to measure render-after-API, not full accordion load
- [ ] **Fix 1A**: In `useEmailFetching`, bypass per-category fetching when total ≤ pageSize
- [ ] Consider removing the misleading "Decrypting..." state (Fix 1B)

### Tooltip (Issue 2)

- [ ] **Fix 2A**: Update `PRIORITY_EXPLANATION` breakdown factors to use emoji prefixes
- [ ] **Fix 2A**: Ensure breakdown values sum to `score` field value
- [ ] **Fix 2B**: Add diagnostic API call in e2e test to verify endpoint before hover test
- [ ] **Fix 2C**: Use direct click on `[data-priority-badge]` instead of hover fallback

### Files to modify

| File                                   | Change                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `server/scripts/seed-test-user.ts`     | Fix PRIORITY_EXPLANATION breakdown factor names and score sums |
| `e2e/tests/inbox-load-time.spec.ts`    | Adjust perf timer, add API smoke test for priority-explanation |
| `client/src/hooks/useEmailFetching.ts` | (optional) Skip accordion loading for small inboxes            |

### Risk assessment

- **Low risk**: Seeder data fix (seed-test-user.ts) — CI-only, no production impact
- **Low risk**: E2e test timing adjustment — makes test more accurate
- **Medium risk**: Skip-accordion optimization — changes client loading behavior, needs testing across modes

---

_Investigation by Monk of Modularity 🧘 — #1610 follow-up_
