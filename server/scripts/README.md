# Database Performance Analysis Scripts

## Available Scripts

### 1. `check-indexes` - Verify and Create Missing Indexes

```bash
npm run check-indexes
```

**What it does:**

- Checks if all required performance indexes exist
- Creates missing indexes automatically
- Shows table statistics
- Runs EXPLAIN ANALYZE on the getInbox query

**Use when:**

- After running migrations
- When performance degrades
- To verify indexes were created correctly

### 2. `analyze-queries` - Analyze Slow Query Performance

```bash
npm run analyze-queries
```

**What it does:**

- Runs EXPLAIN ANALYZE on the slow queries from performance.log
- Shows execution plans and timing
- Checks index usage statistics
- Analyzes email distribution per thread
- Provides performance recommendations

**Use when:**

- Investigating performance issues
- After seeing slow queries in performance.log
- To understand query execution plans

## Performance Budgets

All endpoints now have performance budgets and log to `server/logs/performance.log`:

- **consent-status**: 200ms
- **batch-status**: 500ms
- **triage-suggestions**: 1000ms (with span breakdowns)
- **getInbox(triage)**: 500ms
- **getInbox(process)**: 1000ms

## Known Performance Issues

Based on `performance.log` analysis:

### 1. getInbox(triage) - 1662ms (3.3x over budget)

- **thread_query**: 551ms (5.5x over 100ms budget)
- **email_query**: 834ms (8.3x over 100ms budget)

**Root Cause**: Encryption/decryption overhead on encrypted columns (`from`, `fromName`, `subject`)

**Potential Solutions**:

- Cache decrypted values for frequently accessed emails
- Use raw queries for list views (skip TypeORM entity hydration)
- Consider materialized views for inbox data

### 2. triage-suggestions - 1122ms (122ms over budget)

- **context_query**: 273ms (173ms over 100ms budget) - despite index existing
- **history_query**: 565ms (265ms over 300ms budget)

**Root Cause**:

- Encryption overhead on `contextValue` field
- Encryption overhead on email fields in history query

### 3. consent-status - 276ms (76ms over budget)

- Simple user lookup slightly over budget
- May need user table index optimization

## Index Status

✅ All required indexes exist:

- `IDX_user_contexts_userId`
- `IDX_user_contexts_userId_contextKey`
- `IDX_emails_userId_isBatched_batchReleaseAt`
- `IDX_emails_emailThreadId_priority_received`
- `IDX_email_threads_userId_triage`

## Next Steps

1. **Monitor performance.log** for patterns
2. **Run `analyze-queries`** when seeing slow queries
3. **Consider encryption caching** for frequently accessed data
4. **Use raw queries** for list views to skip entity hydration overhead

---

# Seed Scripts

Seed scripts create deterministic test data directly via TypeORM (encryption is handled transparently by column transformers — no raw SQL needed).

## `seed:test-user` — Basic test user

```bash
cd server && npm run seed:test-user
```

Creates `test@example.com` / `testpassword`. Required before running `seed:search-data`.

## `seed:search-data` — Search CI data

```bash
cd server && npm run seed:search-data
```

Inserts 5 deterministic emails for search CI test scenarios. Depends on the test user from `seed:test-user`.

## `seed:qa` — QA test environment

```bash
cd server && npm run seed:qa
```

Creates `qa@bearlymail.test` / `QaPassword123!` (name: **Professor Reproducible**) with:

- **25 emails** across all inbox categories: unread inbox, newsletters, action items, starred, archived, snoozed, and a 3-message reply thread
- **UserContext rows**: email categories, VIP contact, goals, current project, don't-care rule
- **SummarizationRules**: newsletter rule, action-item rule
- **BlockedSenders**: one example spammer
- **Contacts**: Alice Smith (customer), Bob Jones (partner), Digest Bot (bot)

**Idempotent** — safe to run multiple times. Already-existing records (matched by `messageId` / `emailHash`) are skipped.

### Required env vars

| Variable           | Default             | Notes                           |
| ------------------ | ------------------- | ------------------------------- |
| `DB_HOST`          | `localhost`         |                                 |
| `DB_PORT`          | `5432`              |                                 |
| `DB_USERNAME`      | `postgres`          |                                 |
| `DB_PASSWORD`      | `postgres`          |                                 |
| `DB_NAME`          | `adhd_email_client` |                                 |
| `DB_SSL`           | —                   | Set to `true` for non-local DBs |
| `ENCRYPTION_KEY`   | dev default         | Must match the app's key        |
| `QA_TEST_PASSWORD` | `QaPassword123!`    | Override QA password via env    |

## `seed:qa:reset` — Full wipe + reseed

```bash
cd server && npm run seed:qa:reset
```

Deletes **all** data owned by the QA user (emails, threads, contexts, rules, blocked senders, contacts, the user itself) then re-runs `seed:qa`. Use this to restore a clean state between test runs.

**Only the QA user is affected.** All other users are untouched.

### When to use each

| Command         | Use case                                                |
| --------------- | ------------------------------------------------------- |
| `seed:qa`       | First-time setup, or after tests that only _read_ data  |
| `seed:qa:reset` | After tests that _mutate_ data (to restore known state) |

### Playwright integration (optional)

To reset the QA environment before every CI run, add to `test/global-setup.ts`:

```typescript
import { execSync } from "child_process";
import * as path from "path";

execSync("npm run seed:qa:reset", {
  cwd: path.join(__dirname, "../server"),
  stdio: "inherit",
});
```
