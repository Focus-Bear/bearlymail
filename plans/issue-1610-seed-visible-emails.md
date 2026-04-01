# Plan: Seed Visible Emails for E2E Tests (#1610)

## Problem

The e2e tests added skip logic in CI because seeded emails weren't visible in the
inbox. This is the wrong approach — the seeder should produce emails that are
fully visible and testable.

### Current Skip Logic (to be removed)

1. **`inbox-load-time.spec.ts`** — three separate `test.skip()` calls:
   - Skips when `/emails/inbox` returns non-200 (GmailRequiredGuard blocks)
   - Skips when `CI=true && NODE_ENV=test` (blanket CI skip)
   - Skips when inbox returns 0 emails (empty inbox)

2. **`inbox-load-time.spec.ts` priority popup test** — skips in CI:
   - Skips when `CI=true && NODE_ENV=test`
   - Skips when no priority badges found

3. **CI workflow** only runs `search-ci.spec.ts` and `inbox-load-time.spec.ts` —
   `regression.spec.ts` (which tests inbox email rendering) is NOT run in CI at all.

### Root Causes (Why Seeded Emails Aren't Visible)

**Cause 1: `seed-test-user.ts` creates NO emails**
The test user seeder only creates a `User` record. There are no `Email` or
`EmailThread` records seeded for `test@example.com`. The inbox is literally empty.

**Cause 2: `seed-search-data.ts` seeds incomplete thread records**
- Creates `EmailThread` with only `starCount`, `isArchived`, `urgencyScore`,
  `priorityScore` — missing `categoryId`, `priorityExplanation`, `updatedAt` etc.
- Uses raw SQL inserts with plaintext fields (no encryption) — works for search
  fallback but the inbox decryption layer (`EmailInboxDecryptService`) may not
  handle the mix correctly for display.
- No `UserContext` (categories) seeded for the test user, so even if emails show
  up they'd all be "Other" with no meaningful category filtering.

**Cause 3: GmailRequiredGuard bypass is already in place but insufficient**
The guard IS bypassed when `CI=true && NODE_ENV=test` (both set in CI workflow).
So the guard isn't the blocker — the empty inbox is.

**Cause 4: Inbox query requires specific thread state**
The triage mode query filters: `thread."isArchived" = false AND thread."starCount" = 0`.
The action mode query filters: `thread."isArchived" = false AND thread."starCount" > 0`.
Plus batching/snooze filters. The search seeder's threads meet the triage filter
(`starCount: 0, isArchived: false`) but there are only 5 emails, none with priority
explanations, categories, or summaries — so the inbox would look broken even if
the emails technically appeared.

## Solution

### Approach: Enhance `seed-test-user.ts` to seed a complete inbox

Model after `seed-qa-user.ts` which already does this correctly — it seeds:
- User with proper flags (`hasSeenTour`, `hasCompletedOnboarding`, `hasScannedHistory`)
- `EmailThread` records with priority scores, star counts, archive state
- `Email` records via TypeORM `create`/`save` (which triggers `encryptedColumnTransformer`)
- `UserContext` records for categories
- `Contact` records
- `BlockedSender` records
- `SummarizationRule` records

### Implementation Steps

#### Step 1: Merge `seed-qa-user.ts` pattern into `seed-test-user.ts`

Extend `seed-test-user.ts` to also seed emails after creating the user:

1. **Add email thread + email seeding** — reuse the pattern from `seed-qa-user.ts`
   but for the `test@example.com` user. Seed at least:
   - 5 inbox/triage emails (unread, `starCount: 0`, `isArchived: false`)
   - 2 action/starred emails (`starCount: 1+`, `isArchived: false`)
   - 2 archived emails (`isArchived: true`)
   - 1 multi-email thread (3 emails in same thread)
   
2. **Add `UserContext` seeding** — create 2-3 `EMAIL_CATEGORY` contexts so
   category filtering is testable.

3. **Set `hasScannedHistory: true`** on the test user (already partially done
   but verify it's set, since the inbox UI may show an onboarding state if false).

4. **Use TypeORM `create`/`save`** for emails (NOT raw SQL) — this ensures
   `encryptedColumnTransformer` encrypts `from`, `subject`, `body` etc. with
   the same key the server uses to decrypt.

5. **Seed `priorityExplanation`** on threads — the inbox displays priority
   badges and the priority popup test needs this data. Use a static breakdown
   structure matching the expected schema.

#### Step 2: Assign categories to seeded threads

After creating `UserContext` category records, update the seeded `EmailThread`
records to set `categoryId` pointing to the appropriate context UUID. This
ensures emails appear under the correct category tab.

#### Step 3: Remove skip logic from e2e tests

1. **`inbox-load-time.spec.ts`** — remove all three `test.skip()` blocks:
   - Remove the non-200 status skip (guard is already bypassed)
   - Remove the `CI=true && NODE_ENV=test` skip
   - Remove the 0-emails skip
   
2. **`inbox-load-time.spec.ts` priority popup** — remove the CI skip.
   Keep the "no priority badges found" skip as a safety net but it should
   no longer trigger with properly seeded data.

3. **Consider adding `regression.spec.ts`** to the CI test runner (currently
   only `search-ci.spec.ts` and `inbox-load-time.spec.ts` run). This would
   require the regression tests to use `test@example.com` instead of the QA
   email, or seed the QA user too.

#### Step 4: Add `regression.spec.ts` to CI workflow

Update `.github/workflows/ci.yml` to also run regression tests:
```yaml
npx playwright test search-ci.spec.ts inbox-load-time.spec.ts regression.spec.ts \
  --reporter=html,github
```

Update `regression.spec.ts` to use `TEST_EMAIL`/`TEST_PASSWORD` env vars
(it currently hardcodes `internaltest+openclaw_qa@focusbear.io`).

#### Step 5: Update `seed-search-data.ts` to also set thread categories

The search seeder should assign `categoryId` on its threads so that search
results display with proper categories. This is a minor enhancement.

### Encryption Consideration

The `seed-search-data.ts` comment explains that cross-process encryption
causes a mismatch (both processes log the same key fingerprint but produce
different ciphertext). For `seed-test-user.ts`, this should be investigated:

- If the seed script runs as a separate `ts-node` process (like it does now),
  the same mismatch may occur.
- **Mitigation**: The seed script and server both use the same `ENCRYPTION_KEY`
  env var and the same `crypto.scryptSync('salt')` derivation. The key *should*
  be deterministic. The mismatch noted in `seed-search-data.ts` may have been
  a transient issue or a different encryption key env var.
- **Test**: After implementation, verify that emails seeded by `seed-test-user.ts`
  (via TypeORM save) are correctly decrypted by the server's inbox endpoint.
- **Fallback**: If encryption mismatch persists, use raw SQL inserts with
  plaintext (like `seed-search-data.ts` does) — the server's `tryDecrypt()`
  returns plaintext strings as-is when they don't match the ciphertext format.

### Seed Data Spec

```typescript
const SEED_EMAILS: SeedEmailSpec[] = [
  // ── Triage (visible in inbox, starCount=0) ───────────────
  {
    messageId: 'ci-inbox-001', threadId: 'ci-thread-001',
    from: 'alice@example.com', fromName: 'Alice Smith',
    subject: 'Q3 roadmap review', body: '...',
    receivedAt: daysAgo(1), isRead: false,
    starCount: 0, isArchived: false,
    urgencyScore: 70, priorityScore: 80,
  },
  // ... 4 more triage emails
  
  // ── Action (starred, starCount>0) ────────────────────────
  {
    messageId: 'ci-inbox-006', threadId: 'ci-thread-006',
    from: 'boss@example.com', fromName: 'The Boss',
    subject: 'Urgent: approval needed', body: '...',
    receivedAt: daysAgo(0), isRead: false,
    starCount: 1, isArchived: false,
    urgencyScore: 90, priorityScore: 95,
  },
  // ... 1 more action email
  
  // ── Archived ─────────────────────────────────────────────
  { /* ... 2 archived emails */ },
];
```

### Files to Modify

| File | Change |
|------|--------|
| `server/scripts/seed-test-user.ts` | Add email/thread/context seeding after user creation |
| `e2e/tests/inbox-load-time.spec.ts` | Remove `test.skip()` blocks for CI |
| `e2e/tests/regression.spec.ts` | Use env vars for credentials instead of hardcoded QA email |
| `.github/workflows/ci.yml` | Add `regression.spec.ts` to Playwright test list |
| `server/scripts/seed-search-data.ts` | (minor) Set `categoryId` on threads |

### Testing

1. Run `seed-test-user.ts` locally against a test DB
2. Start the server with `CI=true NODE_ENV=test`
3. Verify `/emails/inbox` returns seeded emails with decrypted fields
4. Run `npx playwright test inbox-load-time.spec.ts` — all tests pass without skips
5. Run `npx playwright test regression.spec.ts` — inbox email list renders

### Risk Assessment

- **Low risk**: Seed scripts are CI-only, never touch production
- **Medium risk**: Encryption mismatch — mitigated by TypeORM transformer + fallback plan
- **Low risk**: Removing test skips — if seeding works correctly, tests should pass

---

*Plan authored by Monk of Modularity 🧘 — issue #1610*
