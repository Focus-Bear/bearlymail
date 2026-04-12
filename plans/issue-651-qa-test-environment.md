# Plan: Seeded QA Test Environment (Issue #651)

> **Planned by:** Monk of Modularity (AI Agent)
> **Date:** 2026-03-04
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/651

---

## Problem Summary

Professor Reproducible needs a BearlyMail test account pre-loaded with realistic, deterministic data so browser-based QA tests can run against a known state. Two blockers exist:

1. **Registration is closed.** `POST /auth/register` throws `BadRequestException` unconditionally. Users must come through the waitlist → admin-approval → password-setup flow, which is unsuitable for automation.
2. **Emails come from Gmail.** Normal onboarding requires OAuth to a real Gmail account. There is no built-in way to inject synthetic emails — but TypeORM transformers handle encryption transparently, so scripts can write directly to Postgres just as the app would.

---

## What We Found in the Codebase

### Database

- **Postgres** via TypeORM (NestJS `@nestjs/typeorm`)
- DB name defaults to `adhd_email_client`
- Connection config comes from env vars: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`

### Encryption

- All PII fields use AES-256-GCM via `EncryptionHelper` (TypeORM column transformers)
- Key comes from `ENCRYPTION_KEY` env var (falls back to a dev default)
- **Scripts that use TypeORM entity repositories get encryption for free** — no manual encrypt/decrypt needed

### User Creation

`UsersService.create(userData: Partial<User>)` → `userRepository.save()`.

- Sets `emailHash` from `EncryptionHelper.hashEmail(email)` automatically
- Must set `isApproved: true` to allow login
- `hasSeenTour: true` skips onboarding splash screen
- `hasCompletedOnboarding: true` skips the full onboarding flow
- `password` must be bcrypt-hashed (salt rounds: 10)

### Auth Flow

- Local login: `POST /auth/login` → validates bcrypt password → returns JWT
- Google SSO: not required for test accounts (password login works)
- JWT guard protects all API routes

### Email Model (Key Fields)

The `emails` table uses TypeORM transformers that auto-encrypt on save:

| Field                                           | Notes                                                     |
| ----------------------------------------------- | --------------------------------------------------------- |
| `userId`                                        | FK to `users.id`                                          |
| `emailThreadId`                                 | FK to `email_threads.id` (required)                       |
| `threadId`                                      | Gmail thread ID string (used as grouping key)             |
| `messageId`                                     | Gmail message ID (unique per user — used for idempotency) |
| `from`                                          | Encrypted sender address                                  |
| `fromName`                                      | Encrypted display name                                    |
| `subject`                                       | Encrypted                                                 |
| `body`                                          | Encrypted plain text                                      |
| `htmlBody`                                      | Encrypted HTML (optional)                                 |
| `receivedAt`                                    | Timestamp                                                 |
| `isRead`                                        | Boolean                                                   |
| `isBatched`, `isSnoozed`, `isProcessingSummary` | Booleans                                                  |
| `googleAccountId`                               | Nullable — can be `null` for seed data                    |

`EmailThread` rows are required first (FK), with `urgencyScore`, `priorityScore`, `starCount`, `isArchived`.

### Other Relevant Entities

| Entity              | Table                 | Purpose                                                           |
| ------------------- | --------------------- | ----------------------------------------------------------------- |
| `UserContext`       | `user_contexts`       | Categories, VIP contacts, goals, rules (encrypted `contextValue`) |
| `SummarizationRule` | `summarization_rules` | Per-user summarization instructions                               |
| `BlockedSender`     | `blocked_senders`     | Blocked email addresses (encrypted + hash)                        |
| `BlockedKeyword`    | `blocked_keywords`    | Blocked keywords                                                  |
| `Contact`           | `contacts`            | CRM-style contacts (encrypted, search-indexed)                    |
| `ProtoCategory`     | `proto_categories`    | Draft categories awaiting promotion                               |

### Existing Seed Precedent ✅

Two scripts already exist that follow the exact pattern we should extend:

- `server/scripts/seed-test-user.ts` — creates `test@example.com` / `testpassword`
- `server/scripts/seed-search-data.ts` — inserts deterministic emails for search CI

Both are registered in `package.json`:

```json
"seed:test-user": "ts-node -r tsconfig-paths/register scripts/seed-test-user.ts",
"seed:search-data": "ts-node -r tsconfig-paths/register scripts/seed-search-data.ts"
```

The `seed-search-data.ts` script already depends on the user created by `seed-test-user.ts` and is the direct model for the QA seed script.

---

## Recommended Approach: TypeScript Seed Script (Same Pattern)

**Do NOT use:**

- ❌ Raw SQL — bypasses TypeORM transformers; encrypted fields will be stored as plaintext
- ❌ Playwright setup fixture alone — Playwright can't create users when registration is closed
- ❌ Mock Gmail integration — overkill; emails can be inserted directly
- ❌ New admin API endpoint — adds production surface area and security risk

**Do use:**

- ✅ `server/scripts/seed-qa-user.ts` — one idempotent TypeScript seed script
- ✅ `server/scripts/reset-qa-user.ts` — companion reset/wipe script
- ✅ Extend `package.json` with `seed:qa` and `seed:qa:reset` npm scripts

This keeps everything consistent with the existing `seed-test-user.ts` + `seed-search-data.ts` pattern. TypeORM handles encryption transparently.

---

## Step-by-Step Implementation Plan for Codebeard

### Step 1 — Create `server/scripts/seed-qa-user.ts`

Model it on `seed-search-data.ts`. The script should:

1. Connect to Postgres via TypeORM `DataSource` (read `.env`)
2. **Create or update the QA user** (`qa@bearlymail.test` / `QaPassword123!`):
   - `isApproved: true`
   - `hasSeenTour: true`
   - `hasCompletedOnboarding: true`
   - `hasScannedHistory: true`
   - bcrypt-hash the password
3. **Seed EmailThreads + Emails** (see "Seed Data" section below)
4. **Seed UserContext rows** — categories, VIP contacts, goals
5. **Seed SummarizationRules** — a couple of rule examples
6. **Seed BlockedSenders** — one example spammer
7. **Seed Contacts** — a handful of realistic contacts
8. All operations must be **idempotent** (check by `messageId` / unique key before inserting)

### Step 2 — Create `server/scripts/reset-qa-user.ts`

Wipes all data for `qa@bearlymail.test` and then calls (or re-imports) the seed logic:

```typescript
// Delete in FK-safe order (mirrors UsersService.deleteAccount)
DELETE FROM emails WHERE userId = qaUserId
DELETE FROM email_threads WHERE userId = qaUserId
DELETE FROM user_contexts WHERE userId = qaUserId
// ... etc
// Then re-run seed
```

Or simply: delete and recreate using the same seed script (idempotency means running seed after wipe = full reset).

### Step 3 — Register npm scripts in `server/package.json`

```json
"seed:qa": "ts-node -r tsconfig-paths/register scripts/seed-qa-user.ts",
"seed:qa:reset": "ts-node -r tsconfig-paths/register scripts/reset-qa-user.ts"
```

### Step 4 — Document in `server/scripts/README.md` (create if absent)

Explain the purpose of each seed script, required env vars, and when to run them.

### Step 5 — Playwright global setup (optional enhancement)

In `test/global-setup.ts`, call `npm run seed:qa` as a `beforeAll` hook so CI always starts from a known state:

```typescript
import { execSync } from "child_process";
// ...
execSync("npm run seed:qa", {
  cwd: path.join(__dirname, "../server"),
  stdio: "inherit",
});
```

---

## Seed Data to Include

### User Account

| Field                  | Value                    |
| ---------------------- | ------------------------ |
| email                  | `qa@bearlymail.test`     |
| password               | `QaPassword123!`         |
| name                   | `Professor Reproducible` |
| isApproved             | true                     |
| hasSeenTour            | true                     |
| hasCompletedOnboarding | true                     |
| hasScannedHistory      | true                     |

### Emails (20–30 across varied categories)

Cover the scenarios needed for QA:

| Scenario             | Count               | Description                             |
| -------------------- | ------------------- | --------------------------------------- |
| Inbox / unread       | 5                   | Recent emails from known senders        |
| Newsletters          | 5                   | Low-priority bulk mail                  |
| Action items         | 3                   | Emails with clear tasks                 |
| Starred / important  | 3                   | High urgency/priority                   |
| Archived             | 4                   | Already processed                       |
| Snoozed              | 2                   | `isSnoozed: true`, future `snoozeUntil` |
| Thread (multi-email) | 1 thread × 3 emails | Reply chain for thread view testing     |

All messageIds should be stable strings like `qa-seed-inbox-001` for idempotency.

### UserContext (Categories & Goals)

```
EMAIL_CATEGORY: "📰 Newsletters"
EMAIL_CATEGORY: "🛠️ Customer Support"
EMAIL_CATEGORY: "💼 Partnerships"
VIP_CONTACT: "ceo@acme.com"
MY_GOALS: "Ship v2 by end of quarter"
WORKING_ON: "Focus Bear mobile redesign" (priority: 1)
DONT_CARE: "Marketing digests older than 7 days"
```

### SummarizationRules

- "When email is a newsletter → summarize in 1 sentence"
- "When email contains an action item → list tasks as bullet points"

### BlockedSenders

- `spammer@badactor.io` — reason: "Unsolicited promotions"

### Contacts

- `alice@acme.com` — Alice Smith (Customer, VIP)
- `bob@partner.org` — Bob Jones (Partner)
- `newsletter@digest.io` — Digest Bot (Bot)

---

## How Professor Can Reset Between Test Runs

**Option A — Full reset (nuke + reseed):**

```bash
cd server
npm run seed:qa:reset
```

**Option B — Re-seed only (idempotent, safe to rerun):**

```bash
cd server
npm run seed:qa
```

Because the script checks messageId/emailHash before inserting, running it after tests that only _read_ data is a no-op.

**Option C — Playwright beforeAll (automated):**
Add `execSync('npm run seed:qa:reset')` to `test/global-setup.ts` so every CI run starts fresh.

---

## Open Questions for Jeremy / Team

1. **Test email address** — `qa@bearlymail.test` is a non-deliverable domain (good). Should it be something else?
2. **Password in code** — For CI, the QA password will be in plaintext in the script. Is that acceptable, or should it come from env (`QA_TEST_PASSWORD`)?
3. **Playwright global setup** — Should `seed:qa:reset` be wired into the Playwright config automatically, or left as a manual step?
4. **Separate test DB** — Would it be safer to run QA seeds against a dedicated `bearlymail_test` DB, to avoid polluting staging/dev data?

---

## Files to Create

```
server/
  scripts/
    seed-qa-user.ts        ← main QA seed script
    reset-qa-user.ts       ← wipe + reseed
    README.md              ← documents all seed scripts
  package.json             ← add seed:qa and seed:qa:reset scripts
```
