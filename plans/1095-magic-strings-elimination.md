# Plan: Issue #1095 — Eliminate ALL magic strings across server and client codebase

## Context

The BearlyMail codebase has ~7,700+ string literals in `server/src/` (non-test) and ~470 in `client/src/`. Some constant files already exist (`server/src/constants/`, `client/src/constants/`), and the `no-restricted-syntax` ESLint rule covers `getPrompt()` calls. But the vast majority of magic strings — error messages, job names, config keys, route paths, entity references, Pusher events, and email labels — remain scattered as raw literals.

This plan breaks the work into 6 phases ordered by **risk × frequency** (highest-risk typo-prone strings first, cosmetic/low-risk last).

### Prior art

- **Plan #787**: Added `no-restricted-syntax` for prompt ID strings (implemented).
- **`server/src/constants/`**: 17 constant files exist (queue, http-status, email-labels, auth, LLM, etc.).
- **`client/src/constants/`**: 7 files (analytics-events, strings, colors, layout, etc.).
- **`server/src/llm/prompts.ts`**: `SUMMARY_PROMPT_IDS`, `PRIORITY_PROMPT_IDS`, `REPLY_PROMPT_IDS`, `CLASSIFICATION_PROMPT_IDS`, `CONTEXT_PROMPT_IDS`, `UTILITY_PROMPT_IDS` — all well-structured.

The existing pattern (`as const` objects + typed exports) is the standard we follow.

---

## Phase 1: PG Boss job names & queue constants (HIGH RISK — runtime failures)

**Why first:** A typo in a job name means jobs silently never run. These are the highest-risk magic strings — invisible failures with no compile-time safety.

**Scope:** ~20 unique job names used in ~40+ locations across server.

**Deliverable:** `server/src/constants/job-names.ts`

```ts
export const JOB_NAMES = {
  SYNC_GMAIL: "sync-gmail",
  SYNC_ALL_USERS: "sync-all-users",
  SYNC_ALL_USERS_URGENT: "sync-all-users-urgent",
  QUEUE_USER_SYNCS_URGENT: "queue-user-syncs-urgent",
  SCHEDULE_EMAIL_FETCH_JOBS: "schedule-email-fetch-jobs",
  SCHEDULE_EXTENDED_EMAIL_FETCH_JOBS: "schedule-extended-email-fetch-jobs",
  SCHEDULE_CONTACT_SYNC_JOBS: "schedule-contact-sync-jobs",
  SCHEDULE_VERIFY_INBOX_STATUS: "schedule-verify-inbox-status",
  CHECK_EXPIRED_SNOOZES: "check-expired-snoozes",
  UNSNOOZE_THREAD: "unsnooze-thread",
  SEND_SCHEDULED_EMAILS: "send-scheduled-emails",
  BULK_SEND_FOLLOW_UPS: "bulk-send-follow-ups",
  GENERATE_FOLLOW_UP_DRAFT: "generate-follow-up-draft",
  ANALYZE_CONTEXT_BATCH: "analyze-context-batch",
  CHECK_WRITING_STYLE_LEARNING: "check-writing-style-learning",
  ARCHIVE_EMAIL: "archive-email",
  ARCHIVE_EMAIL_PROVIDER_SYNC: "archive-email-provider-sync",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
```

**Files to update:** All `boss.send()`, `boss.work()`, and processor files referencing these strings.

**Estimated changes:** ~40 file edits.

---

## Phase 2: Error messages & HTTP exception strings (HIGH RISK — inconsistency)

**Why:** 24 occurrences of `"Email not found"`, 17 of `"User not found"`, etc. Inconsistent error messages make debugging harder and client-side error handling fragile.

**Scope:** ~15 unique error messages repeated 3+ times, totalling ~120+ occurrences.

**Deliverable:** `server/src/constants/error-messages.ts`

```ts
export const ERROR_MESSAGES = {
  EMAIL_NOT_FOUND: "Email not found",
  USER_NOT_FOUND: "User not found",
  THREAD_NOT_FOUND: "Thread not found",
  CONTACT_NOT_FOUND: "Contact not found",
  DEAL_NOT_FOUND: "Deal not found",
  FOLLOW_UP_NOT_FOUND: "Follow-up not found",
  GOOGLE_ACCOUNT_NOT_FOUND: "Google account not found",
  OFFICE365_ACCOUNT_NOT_FOUND: "Office 365 account not found",
  ZOHO_ACCOUNT_NOT_FOUND: "Zoho account not found",
  NOT_CONNECTED_TO_GMAIL: "User not connected to Gmail",
  GOOGLE_CALENDAR_NOT_CONNECTED: "Google Calendar not connected",
  GITHUB_TOKEN_NOT_CONFIGURED: "GitHub token not configured",
  GITHUB_TOKEN_INVALID: "GitHub token is invalid or expired",
  REFRESH_TOKEN_MISSING: "Refresh token missing - please log in again",
  GMAIL_ACCESS_TOKEN_MISSING: "Gmail access token missing - please log in again",
  NO_EMAIL_PROVIDER: "No email provider connected",
  CUSTOM_FIELD_NOT_FOUND: "Custom field not found",
  FAILED_TO_SEND_REPLY: "Failed to send reply",
  FAILED_TO_SEND_EMAIL: "Failed to send email",
} as const;
```

**Files to update:** ~106 files that throw exceptions with string literals.

**Estimated changes:** ~100+ file edits.

---

## Phase 3: Environment variable keys & config constants (MEDIUM RISK — typo = undefined at runtime)

**Why:** 30+ unique `process.env.*` keys used directly in 161 locations. A typo means `undefined` at runtime with no compile-time warning. `configService.get("KEY")` calls have the same problem.

**Scope:** ~30 env var names, ~20 configService keys.

**Deliverable:** `server/src/constants/env-keys.ts`

```ts
export const ENV_KEYS = {
  NODE_ENV: "NODE_ENV",
  PORT: "PORT",
  DB_HOST: "DB_HOST",
  DB_PORT: "DB_PORT",
  DB_NAME: "DB_NAME",
  DB_USERNAME: "DB_USERNAME",
  DB_PASSWORD: "DB_PASSWORD",
  DB_SSL: "DB_SSL",
  ENCRYPTION_KEY: "ENCRYPTION_KEY",
  JWT_SECRET: "JWT_SECRET",
  FRONTEND_URL: "FRONTEND_URL",
  GOOGLE_CLIENT_ID: "GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "GOOGLE_CLIENT_SECRET",
  GOOGLE_REDIRECT_URI: "GOOGLE_REDIRECT_URI",
  MICROSOFT_CLIENT_ID: "MICROSOFT_CLIENT_ID",
  MICROSOFT_CLIENT_SECRET: "MICROSOFT_CLIENT_SECRET",
  MICROSOFT_TENANT_ID: "MICROSOFT_TENANT_ID",
  MICROSOFT_REDIRECT_URI: "MICROSOFT_REDIRECT_URI",
  ZOHO_CLIENT_ID: "ZOHO_CLIENT_ID",
  ZOHO_CLIENT_SECRET: "ZOHO_CLIENT_SECRET",
  ZOHO_REDIRECT_URI: "ZOHO_REDIRECT_URI",
  ZOHO_API_DOMAIN: "ZOHO_API_DOMAIN",
  ZOHO_CLIQ_API_KEY: "ZOHO_CLIQ_API_KEY",
  AWS_REGION: "AWS_REGION",
  AWS_DEFAULT_REGION: "AWS_DEFAULT_REGION",
  SES_FROM_EMAIL: "SES_FROM_EMAIL",
  FEEDBACK_SCREENSHOTS_BUCKET: "FEEDBACK_SCREENSHOTS_BUCKET",
  POSTHOG_API_KEY: "POSTHOG_API_KEY",
  POSTHOG_HOST: "POSTHOG_HOST",
  TERMS_VERSION: "TERMS_VERSION",
  PRIVACY_VERSION: "PRIVACY_VERSION",
  WORKER_MODE: "WORKER_MODE",
  WORKER_ID: "WORKER_ID",
  AUTOSCALING_ENABLED: "AUTOSCALING_ENABLED",
  CALENDAR_BOOKING_URL: "CALENDAR_BOOKING_URL",
  SLOW_QUERY_THRESHOLD_MS: "SLOW_QUERY_THRESHOLD_MS",
  QUEUE_MONITOR_INTERVAL_SECONDS: "QUEUE_MONITOR_INTERVAL_SECONDS",
  RESOURCE_MONITOR_INTERVAL_SECONDS: "RESOURCE_MONITOR_INTERVAL_SECONDS",
  BUILD_TIME: "BUILD_TIME",
  COMMIT_HASH: "COMMIT_HASH",
} as const;
```

**Files to update:** All files using `process.env.X` or `configService.get("X")` directly.

**Estimated changes:** ~80 file edits.

---

## Phase 4: Email labels, Pusher events & inject tokens (MEDIUM RISK)

**Why:** `GMAIL_LABELS` constant exists but isn't used everywhere (20+ scattered uses of `"SENT"`, `"INBOX"`, `"UNREAD"`, etc.). Pusher event names (`"contacts-sync-started"` etc.) and `@Inject("PG_BOSS")` tokens need constants too.

**Scope:**
- Email labels: ~20 scattered uses not using `GMAIL_LABELS`
- Pusher events: 3 unique names
- Inject tokens: `"PG_BOSS"` used 38 times

**Deliverables:**
- Update all label usages to import from `server/src/constants/email-labels.ts`
- `server/src/constants/pusher-events.ts`
- `server/src/constants/inject-tokens.ts`

```ts
// pusher-events.ts
export const PUSHER_EVENTS = {
  CONTACTS_SYNC_STARTED: "contacts-sync-started",
  CONTACTS_SYNC_COMPLETE: "contacts-sync-complete",
  CONTACTS_SYNC_FAILED: "contacts-sync-failed",
} as const;

// inject-tokens.ts
export const INJECT_TOKENS = {
  PG_BOSS: "PG_BOSS",
} as const;
```

**Files to update:** ~60 file edits (38 for PG_BOSS alone).

---

## Phase 5: API route paths, controller paths & entity table names (LOWER RISK — rarely change)

**Why:** These are relatively stable but still benefit from centralized constants for IDE navigation and refactoring. 35 controller paths, ~40 entity table names, dozens of sub-route decorators.

**Deliverables:**
- `server/src/constants/route-paths.ts` — Controller base paths
- `server/src/constants/entity-names.ts` — TypeORM entity table names (replace `@Entity("table_name")` strings)

```ts
// route-paths.ts (sample)
export const ROUTE_PATHS = {
  AUTH: "auth",
  EMAILS: "emails",
  DRAFTS: "drafts",
  CALENDAR: "calendar",
  CONTACTS: "contacts",
  // ... all 35 controller paths
} as const;

// entity-names.ts (sample)
export const ENTITY_NAMES = {
  USERS: "users",
  EMAILS: "emails",
  EMAIL_THREADS: "email_threads",
  CONTACTS: "contacts",
  // ... all 40 entity table names
} as const;
```

**Also:** Replace TypeORM query builder alias strings (`"thread"`, `"email"`, `"user"`) with constants.

**Estimated changes:** ~80 file edits.

---

## Phase 6: Client-side cleanup & ESLint enforcement (FINAL)

**Why:** Client has fewer magic strings (~470) but still has scattered literals. Also the final enforcement step — extend the ESLint `no-restricted-syntax` rule to cover ALL the categories above.

**Scope:**
- Client: Replace remaining magic strings in components/hooks with constants from `client/src/constants/`
- Server ESLint: Extend `no-restricted-syntax` to catch job names, error messages, env keys, route paths, inject tokens
- Client ESLint: Add equivalent rule if not present

**Deliverables:**
- Updated `server/.eslintrc.js` with expanded `no-restricted-syntax` selectors
- Updated `client/.eslintrc.js` (if applicable)
- Client string constant cleanup (move remaining literals to `client/src/constants/strings.ts` or new domain-specific files)
- Fix one hardcoded Logger context (`"ConsentStatusPerformanceTracker"` in `users.controller.ts` → use `.name`)

**Estimated changes:** ~50 file edits.

---

## Summary table

| Phase | Category | Risk | Unique strings | Estimated file edits | Depends on |
|-------|----------|------|---------------|---------------------|------------|
| 1 | PG Boss job names | 🔴 HIGH | ~20 | ~40 | — |
| 2 | Error messages | 🔴 HIGH | ~15 | ~100 | — |
| 3 | Env var / config keys | 🟡 MEDIUM | ~35 | ~80 | — |
| 4 | Email labels, Pusher, inject tokens | 🟡 MEDIUM | ~25 | ~60 | — |
| 5 | Route paths, entity names, query aliases | 🟢 LOWER | ~80 | ~80 | — |
| 6 | Client cleanup & ESLint enforcement | 🟢 LOWER | ~50 | ~50 | 1-5 |

**Total estimated: ~410 file edits across 6 PRs.**

Phases 1–4 are independent and can be parallelized. Phase 5 is independent. Phase 6 should come last (ESLint rules enforce that phases 1–5 stay clean).

## Implementation notes

- Each phase = one PR, one issue label per phase (e.g., `magic-strings-phase-1`)
- All constant files use `as const` + exported type aliases for type safety
- Test files are excluded from ESLint string rules (test fixtures need raw strings)
- Migration files are excluded (historical SQL, never changes)
- The pattern follows existing conventions (`GMAIL_LABELS`, `SUMMARY_PROMPT_IDS`, etc.)
- Codebeard should run full test suite after each phase to catch regressions

## Acceptance criteria

- [ ] All PG Boss job name strings use `JOB_NAMES` constants
- [ ] All repeated error messages use `ERROR_MESSAGES` constants
- [ ] All `process.env.*` / `configService.get()` calls use `ENV_KEYS` constants
- [ ] All Gmail label references use `GMAIL_LABELS` constants
- [ ] All Pusher event names use `PUSHER_EVENTS` constants
- [ ] All `@Inject("PG_BOSS")` uses `INJECT_TOKENS.PG_BOSS`
- [ ] Controller paths and entity names use centralized constants
- [ ] ESLint `no-restricted-syntax` covers all categories
- [ ] `npm run lint` exits 0 in both server and client
- [ ] `npm run test` exits 0 in both server and client
- [ ] No new magic strings introduced in any of the above categories
