# CLAUDE.md - BearlyMail Codebase Documentation

**Last Updated**: 2026-02-14
**Maintained By**: BearlyMail Team
**Purpose**: Comprehensive reference for AI assistants working with the BearlyMail codebase

> **Note**: This is the canonical technical reference for AI assistants. For other documentation needs, see the [Documentation Guide](#documentation-guide) below.

---

## Documentation Guide

This repository has multiple documentation files with clear separation of concerns:

| Document                         | Purpose                                                                               | Audience                                           |
| -------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **CLAUDE.md** (this file)        | Comprehensive technical reference: patterns, entities, design decisions (imports Architecture.md) | AI assistants (Claude, etc.)                       |
| **Architecture.md**              | Server module organization and client architecture file trees (imported by CLAUDE.md) | AI assistants (Claude, etc.)                       |
| **README.md**                    | Project overview, features, tech stack, quick start                                   | Human developers (first-time visitors)             |
| **QUICKSTART.md**                | Step-by-step setup guide with commands and troubleshooting                            | Human developers (getting started)                 |
| **.claude-code/instructions.md** | Development workflow, testing requirements, performance budgets                       | AI assistants (legacy location, may be deprecated) |

**Maintenance Note**: When updating technical details (API endpoints, entities, env vars, etc.), update CLAUDE.md as the canonical source. Other docs can reference this file to avoid duplication.

---

## What is BearlyMail?

BearlyMail is an AI-powered email client for users with ADHD. It reduces cognitive load through intelligent prioritization, email batching, AI-generated replies, and context learning. Users connect Gmail, Office365, or Zoho accounts and manage email through three inbox modes: Triage (new/unstarred), Action (starred/needs work), and Follow-Up (awaiting replies).

## Repository Structure

Monorepo with three main packages:

```
BearlyMail/
├── client/           # React 19 frontend (Vite build, TypeScript)
├── server/           # NestJS backend API + worker (TypeScript, TypeORM, PostgreSQL)
├── infrastructure/   # AWS CDK stacks (ECS Fargate, RDS, CloudFront, S3)
├── e2e/              # Playwright E2E tests (Page Object Model)
├── .github/workflows # CI/CD (ci.yml, deploy.yml, claude.yml)
└── .claude-code/     # Claude-specific instructions (legacy location)
```

## Quick Commands

```bash
# Install all dependencies
npm run install-all

# Start dev (server + client concurrently)
npm run dev

# Fully local one-command run: embedded PostgreSQL (no Docker) + server + worker + client
npm run local

# Server only (http://localhost:3001)
cd server && npm run start:dev

# Client only (http://localhost:3000)
cd client && npm start

# Database (Docker)
npm run db:up          # Start PostgreSQL 17
npm run db:down        # Stop
npm run db:reset       # Reset all data

# Migrations
cd server && npm run migration:run

# Lint
cd server && npm run lint
cd client && npm run lint

# Import ordering is enforced and auto-fixable (simple-import-sort)
cd server && npm run lint   # --fix enabled in script
cd client && npm run lint:fix

# Build (must pass before PR)
cd server && npm run build
cd client && npm run build

# Tests
cd server && npm run test:cov -- --forceExit
cd client && npm test -- --passWithNoTests
cd e2e && npm test

# Promptfoo (LLM prompt tests)
cd server && npm run promptfoo:test
```

## CI Pipeline (`.github/workflows/ci.yml`)

All of these must pass on PRs to `main`:

| Job                 | What it checks                                                         |
| ------------------- | ---------------------------------------------------------------------- |
| `server-coverage`   | Server unit tests with coverage (needs PostgreSQL 17 service)          |
| `client-tests`      | Client unit tests                                                      |
| `server-lint`       | ESLint on server code                                                  |
| `client-lint`       | ESLint on client code                                                  |
| `client-build`      | Client builds successfully                                             |
| `server-smoke-test` | Server builds, migrations run, health endpoint responds, worker starts |
| `promptfoo-tests`   | LLM prompt quality tests (needs `OPENAI_API_KEY` secret)               |

## Tech Stack

### Backend (`server/`)

- **Framework**: NestJS with TypeScript (strict mode)
- **Database**: PostgreSQL 17 with TypeORM (entities + migrations)
- **Auth**: JWT + Passport (local strategy, Google OAuth, Microsoft OAuth, Zoho OAuth)
- **Job Queue**: PgBoss (PostgreSQL-based, priority queuing)
- **LLM**: OpenAI (default) and Google Gemini with automatic fallback (configurable via `LLM_PROVIDER` env var)
- **Encryption**: AES-256-GCM for all sensitive data at rest
- **Process Model**: Separate web server (`main.ts`) and worker (`worker.ts`) processes

### Frontend (`client/`)

- **Framework**: React 19 with TypeScript
- **Build**: Vite
- **State**: Redux Toolkit (email cache, optimistic updates) + custom hooks (feature state)
- **Routing**: React Router v6 (URL params sync inbox mode and selected email)
- **i18n**: react-i18next (all user-facing text MUST use `t()`)
- **HTTP**: Axios with `API_URL` env var
- **Analytics**: PostHog (optional)

### Infrastructure (`infrastructure/`)

- **IaC**: AWS CDK (TypeScript)
- **Compute**: ECS Fargate (web service, worker service, cron tasks)
- **Database**: RDS PostgreSQL (private subnet)
- **CDN**: CloudFront + S3 for frontend
- **CI/CD**: GitHub Actions with OIDC (no static AWS credentials)

---

## Architecture Deep Dive

The detailed server module organization and client architecture trees live in a separate file to keep this reference lean:

@./Architecture.md

---

## Quick File Finder

Need to modify something? Here's where to find it:

| Need to modify...                                | Look in...                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Email sync logic**                             | `server/src/emails/email-sync.processor.ts`                                  |
| **Inbox query (triage/action/follow-up)**        | `server/src/emails/emails.service.ts` → `getInbox()`                         |
| **Priority calculation**                         | `server/src/llm/priority-analysis.service.ts`                                |
| **Categorisation pipeline (how categoryId is decided)** | [`docs/categorisation-pipeline.md`](docs/categorisation-pipeline.md)  |
| **Email summarization**                          | `server/src/summarization/summarization.service.ts`                          |
| **Reply generation**                             | `server/src/replies/replies.service.ts`                                      |
| **Ask AI assistant (agentic, tool-using)**       | `server/src/ask-ai/` (`ask-ai-agent.service.ts` loop, `ask-ai-tools.service.ts` registry) |
| **Context analysis (VIP detection, categories)** | `server/src/context/context.service.ts`                                      |
| **Gmail provider implementation**                | `server/src/emails/providers/gmail.provider.ts`                              |
| **Office365 provider implementation**            | `server/src/emails/providers/office365.provider.ts`                          |
| **Zoho provider implementation**                 | `server/src/emails/providers/zoho.provider.ts`                               |
| **Apple Mail (local) provider implementation**   | `server/src/emails/providers/apple-mail.provider.ts` + `server/src/apple-mail-accounts/` (JXA scripts, account + message-ref services) |
| **Provider routing logic**                       | `server/src/emails/email-provider-manager.service.ts`                        |
| **LLM prompts (all prompts)**                    | `server/promptfoo/prompts/*.md`                                              |
| **Prompt loading logic**                         | `server/src/llm/prompts.ts`                                                  |
| **Encryption/decryption helpers**                | `server/src/encryption/encryption.helper.ts`                                 |
| **Job queue priorities**                         | `server/src/queue/job-priorities.ts`                                         |
| **Performance budgets**                          | `server/src/constants/performance-budgets.ts`                                |
| **Database entities**                            | `server/src/database/entities/*.entity.ts`                                   |
| **Migrations**                                   | `server/src/database/migrations/*.ts`                                        |
| **Frontend inbox state**                         | `client/src/hooks/useInboxState.ts` (mega-hook)                              |
| **Frontend email fetching**                      | `client/src/hooks/useEmailManagement.ts` → `useEmailFetching.ts`             |
| **Frontend email actions**                       | `client/src/hooks/useEmailActions.ts` → `useEmailActionsBase.ts`             |
| **Frontend bulk operations**                     | `client/src/hooks/useBulkEmailActions.ts`                                    |
| **Frontend email detail**                        | `client/src/hooks/useEmailDetail.ts`                                         |
| **Frontend keyboard shortcuts**                  | `client/src/hooks/useKeyboardShortcuts.ts` + `useInboxKeyboardNavigation.ts` |
| **Redux email slice**                            | `client/src/store/slices/emailSlice.ts`                                      |
| **API configuration**                            | `client/src/config/api.ts`                                                   |
| **Translations (EN)**                            | `client/src/locales/en.json`                                                 |
| **Translations (ES)**                            | `client/src/locales/es.json`                                                 |
| **Color theme**                                  | `client/src/theme/`                                                          |

---

## Entity Reference (Database Schema)

### Core Entities

#### `User` (`users` table)

- `id` (UUID PK), `email` (encrypted), `emailHash` (SHA-256, for lookups), `password` (bcrypt)
- `name`, `displayName`, `jobTitle` (all encrypted)
- `googleId`, OAuth tokens for calendar
- `isAdmin`, `isApproved` (waitlist), `needsRelogin`
- `hasSeenTour`, `hasScannedHistory`, `hasCompletedOnboarding`
- `lastEmailSyncAt`, `subscriptionStatus`, `trialStartedAt`
- `openAiApiKey` (encrypted, user's own key), `githubToken` (encrypted)
- `toneSettings` (encrypted JSON: `{ rules: string[] }`)
- `autoResponderSettings` (encrypted JSON)
- Relations: `emails`, `contexts`, `notes`, `summarizationRules`, `actionItems`, `googleAccounts`, `office365Accounts`, `zohoAccounts`

#### `Email` (`emails` table)

- `id` (UUID PK), `userId` (FK), `threadId` (provider's thread ID), `emailThreadId` (FK to `email_threads`), `messageId`
- `from`, `fromName`, `senderJobTitle`, `to`, `cc`, `replyTo`, `subject`, `body`, `htmlBody` (all encrypted)
- `summary` (encrypted), `labels` (encrypted JSON array)
- `isSnoozed`, `snoozeUntil`, `isBatched`, `batchReleaseAt`, `wasDeliveredEarly`, `batchDecisionReason`
- `isRead`, `isProcessingSummary`, `sentimentScore`, `timeToReply`
- `userPriorityOverride`, `priorityOverrideReason` (encrypted), `priorityOverrideReasonType`
- `attachments` (encrypted JSON: `{attachmentId, filename, mimeType, size}[]`)
- `receivedAt` (CreateDateColumn)
- Indexes on: `[userId, threadId]`, `[userId, messageId]`, `[userId, receivedAt]`, `[userId, emailThreadId]`, `[userId, isBatched, batchReleaseAt]`

#### `EmailThread` (`email_threads` table)

- `id` (UUID PK), `userId` (FK), `threadId` (provider's thread ID, unique per user)
- `starCount` (0-3: 0=triage, 1-3=action mode priority levels)
- `isArchived`, `isSnoozed`, `snoozeUntil`
- `urgencyScore` (0-100), `urgencyExplanation` (encrypted)
- `priorityScore` (denormalized 0-100 for sorting), `priorityExplanation` (encrypted JSON with dimensions breakdown)
- `isProcessingPriority` (flag while LLM calculates)
- `category` (encrypted), `categoryExplanation` (encrypted), `protoCategoryId` (FK)
- `githubMetadata` (encrypted JSON: `{links: [{type, repo, owner, number, url, status}]}`)
- `lastUserOperationAt` (prevents sync from overriding user actions)
- `lastCheckedAt` (when last verified against provider)
- `createdAt`, `updatedAt`
- Indexes on: `[userId, threadId]` (unique), `[userId, starCount, isArchived]`, `[userId, urgencyScore]`, `[userId, priorityScore]`

#### `UserContext` (`user_contexts` table)

- `contextId` (UUID PK), `userId` (FK)
- `contextKey` (enum: `VIP_CONTACT`, `MY_GOALS`, `DONT_CARE`, `WORKING_ON`, `USER_INFO`, `URGENT`, `NOT_IMPORTANT`, `Q_AND_A`, `EMAIL_CATEGORY`, plus legacy keys)
- `contextValue` (encrypted), `priority` (1-3 for `WORKING_ON` items)
- `source` (enum: `AUTOGENERATED` | `USER_EDITED`)
- `explanation` (encrypted), `sourceThreadIds` (array of thread IDs)

### Supporting Entities

| Entity                    | Table                        | Purpose                                              |
| ------------------------- | ---------------------------- | ---------------------------------------------------- |
| `GoogleAccount`           | `google_accounts`            | OAuth tokens for Gmail                               |
| `Office365Account`        | `office365_accounts`         | OAuth tokens for Microsoft                           |
| `ZohoAccount`             | `zoho_accounts`              | OAuth tokens for Zoho Mail                           |
| `ContextAnalysis`         | `context_analyses`           | Tracks progress of background analysis jobs (0-100%) |
| `BatchSchedule`           | `batch_schedules`            | Per-user email batching schedule                     |
| `BlockedSender`           | `blocked_senders`            | Blocked email addresses                              |
| `BlockedKeyword`          | `blocked_keywords`           | Blocked subject keywords                             |
| `CategoryOverride`        | `category_overrides`         | User manual category reassignments                   |
| `PriorityOverride`        | `priority_overrides`         | User manual priority overrides                       |
| `PrivateNote`             | `private_notes`              | User notes on threads                                |
| `ActionItem`              | `action_items`               | Extracted action items from emails                   |
| `FollowUp`                | `follow_ups`                 | Follow-up tracking and drafts                        |
| `SuggestedReply`          | `suggested_replies`          | Pre-generated reply options                          |
| `ReplyDraft`              | `reply_drafts`               | Saved reply drafts                                   |
| `SummarizationRule`       | `summarization_rules`        | Custom summarization rules                           |
| `ProtoCategory`           | `proto_categories`           | Suggested categories for "Other" emails              |
| `Contact`                 | `contacts`                   | Synced contact information                           |
| `ScanEmail`               | `scan_emails`                | Historical email scan tracking                       |
| `TokenUsage`              | `token_usages`               | LLM token usage per operation                        |
| `GithubRepoMapping`       | `github_repo_mappings`       | GitHub repo to email thread mappings                 |
| `SchedulingPreference`    | `scheduling_preferences`     | Meeting scheduling preferences                       |
| `AutoResponseLog`         | `auto_response_logs`         | Auto-responder activity log                          |
| `AutoResponseSuppression` | `auto_response_suppressions` | Auto-response suppression rules                      |
| `Waitlist`                | `waitlist`                   | Waitlist signups                                     |

---

## Coding Standards

### Comments (Clean Code Rules)

We follow Clean Code principles for comments:

**Write comments only when they add value beyond the code itself.**

✅ **Good comments** — JSDoc on non-obvious functions/components explaining _what_ and _why_:

```typescript
/**
 * Returns the theme colour associated with a given LLM batch error type.
 * Rate-limit and network errors are red; timeouts and token-limit errors are orange.
 */
export function getErrorTypeColor(errorType: string | null): string { ... }

/**
 * Renders the expanded section of an analysis card, showing the top-level error
 * message (if any), a list of per-batch failures, and IDs for debugging.
 */
export const AnalysisCardExpandedContent: React.FC<...> = ...
```

❌ **Useless comments** — anything that just restates the name:

```typescript
// --- useContextAnalysisData ---       ← separator comment, adds nothing
// formatDate                           ← the function name already says this
// TODO: fix later                      ← vague, belongs in an issue tracker
```

**If a sub-component is large enough to need a `// --- separator ---`, it belongs in its own file instead.**

### Component Organisation

- Keep components focused. If a file exceeds ~200 lines, consider whether sub-components can be split into their own files.
- Sub-components shared by multiple files → extract to their own `.tsx` file immediately.
- Sub-components used only by one parent → can co-locate inside the parent file IF the total file length stays manageable.
- Prefer a thin orchestrator (data + layout) with sub-components imported from sibling files.

---

## Key Design Patterns

### 1. Encryption at Rest

All sensitive email data (from, subject, body, etc.) is encrypted using AES-256-GCM via TypeORM column transformers:

```typescript
// Automatic encryption/decryption via TypeORM transformer
@Column({ transformer: encryptedColumnTransformer })
from: string;

// JSON fields use a separate transformer
@Column({ transformer: encryptedJsonTransformer })
labels: string[];
```

**Critical rule**: When using raw SQL queries (for performance), you must manually decrypt fields:

```typescript
const rawEmails = await this.emailRepository.query(
  `SELECT "from", subject FROM emails WHERE ...`,
);
const decrypted = rawEmails.map((row) => ({
  from: EncryptionHelper.decrypt(row.from),
  subject: EncryptionHelper.decrypt(row.subject),
}));
```

JSON fields need decrypt then parse: `JSON.parse(EncryptionHelper.decrypt(row.labels))`

### 2. Email Provider Abstraction

All providers implement the `EmailProvider` interface (`server/src/emails/interfaces/email-provider.interface.ts`):

```typescript
interface EmailProvider {
  syncEmails(userId, syncWindowHoursOrOptions?): Promise<void>;
  sendReply(
    userId,
    threadId,
    to,
    subject,
    body,
    attachments?,
    htmlBody?,
  ): Promise<{ messageId; threadId }>;
  sendEmail(
    userId,
    to,
    subject,
    body,
    cc?,
    bcc?,
    attachments?,
  ): Promise<{ messageId; threadId }>;
  archiveThread(userId, threadId): Promise<void>;
  unarchiveThread(userId, threadId): Promise<void>;
  syncStarStatusToGmail(userId, threadId, starCount): Promise<void>;
  snoozeThread(userId, threadId, snoozeUntil): Promise<void>;
  searchEmails(userId, query, maxResults?): Promise<RawEmailMessage[]>;
  getAttachment(
    userId,
    messageId,
    attachmentId,
    metadata?,
  ): Promise<{ data; filename; mimeType; size }>;
  // ... more methods
}
```

`EmailProviderManager` routes operations to the correct provider based on user's connected accounts.

### 3. Background Job System (PgBoss)

Jobs are enqueued in the web server and processed by worker processes. Key job types:

| Job Name                      | Priority         | Description                                                  |
| ----------------------------- | ---------------- | ------------------------------------------------------------ |
| `schedule-email-fetch-jobs`   | MEDIUM (40)      | Cron: schedules per-user sync jobs                           |
| `fetch-user-emails`           | HIGH (80)        | Sync emails from provider                                    |
| `refine-priority`             | HIGH (80)        | Calculate priority score for single email                    |
| `refine-priority-batch`       | MEDIUM_HIGH (60) | Batch priority calculation (multiple emails in one LLM call) |
| `generate-summary`            | HIGH (80)        | Generate AI summary for email                                |
| `analyze-context`             | LOW (20)         | Start long-running context analysis                          |
| `analyze-context-batch`       | LOW (20)         | Process one batch of emails for context                      |
| `finalize-context-analysis`   | LOW (20)         | Post-processing after batches complete                       |
| `learn-from-star`             | VERY_LOW (10)    | Update context from user starring behavior                   |
| `learn-qa-from-sent`          | VERY_LOW (10)    | Debounced per-user: extract Q&A from recent sent emails       |
| `archive-email-provider-sync` | HIGH (80)        | Sync archive to Gmail/Office365/Zoho                         |
| `auto-responder`              | LOW (20)         | Generate and send auto-responses                             |
| `generate-suggested-replies`  | LOW (20)         | Pre-generate reply suggestions                               |
| `scan-history`                | MEDIUM (40)      | Historical email scan (onboarding)                           |

User-triggered jobs get priority boost. See `server/src/queue/job-priorities.ts`.

### 4. Inbox Modes and Filtering

Three modes with different query filters applied in `EmailsService.getInbox()`:

| Mode        | Filter                                              | Description                       |
| ----------- | --------------------------------------------------- | --------------------------------- |
| `triage`    | `isArchived=false AND starCount=0`                  | New emails needing initial review |
| `action`    | `isArchived=false AND starCount>0`                  | Starred emails needing work       |
| `follow-up` | `isArchived=false AND starCount>0` + user sent last | Awaiting replies                  |

All modes also filter: not batched (or batch released), not snoozed (or snooze expired), not from blocked senders.

Sorting: `priorityScore DESC, updatedAt DESC, threadId ASC` (stable sort).

### 5. Optimistic Updates (Client)

Archive, snooze, and star operations update the UI immediately:

1. Email removed from list instantly via Redux `addOptimisticArchive`
2. API call fires in background
3. On failure: email restored via `restoreEmail` (inserts in correct sorted position)
4. On next fetch: optimistic IDs filtered from results to prevent flash-back

### 6. `useInboxState` Mega-Hook Pattern

`client/src/hooks/useInboxState.ts` is the central orchestrator that composes 22+ specialized hooks. Each hook manages one concern (selection, split-view, keyboard shortcuts, etc.) and the mega-hook wires them together. The `Inbox.tsx` page destructures the return value.

### 7. LLM Prompt Management

Prompts are stored as markdown files in `server/promptfoo/prompts/` (at the server root, NOT inside `src/`) and loaded via `getPrompt()` / `renderPrompt()` in `server/src/llm/prompts.ts` (Nunjucks-style `{{variable}}` templating with `{% if %}` / `{% for %}` support). Never hardcode prompts in service code.

Token usage is tracked per operation type via `LLM_OP_*` constants in `server/src/llm/llm-operations.ts`.

**LLM Fallback**: If the primary provider fails, the system automatically falls back to the other provider. If Gemini fails → falls back to OpenAI. If OpenAI fails → falls back to Gemini. Users can also provide their own OpenAI API key (`user.openAiApiKey`), which takes precedence over the system key.

**Available Prompts** (in `server/promptfoo/prompts/`):

| Prompt File                         | Prompt ID                        | Purpose                                                       |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| `prioritise-email.md`               | `analyze_priority`               | Score email importance (0-100)                                |
| `analyze-email-patterns.md`         | `analyze_email_patterns`         | Extract VIP contacts, projects, categories from email history |
| `analyze-priority-feedback.md`      | `analyze_priority_feedback`      | Learn from user priority overrides                            |
| `generate-reply.md`                 | `generate_reply`                 | Generate single reply draft                                   |
| `generate-multiple-replies.md`      | `generate_multiple_replies`      | Generate 3-5 reply options                                    |
| `generate-meeting-reply.md`         | `generate_meeting_reply`         | Generate meeting scheduling reply                             |
| `generate-follow-up.md`             | `generate_follow_up`             | Generate follow-up email draft                                |
| `check-tone-style.md`               | `check_tone_style`               | Check reply tone before sending                               |
| `dispute-tone-check.md`             | `dispute_tone_check`             | Evaluate user's tone check dispute                            |
| `extract-action-items.md`           | `extract_action_items`           | Extract actionable items from email                           |
| `extract-common-questions.md`       | `extract_common_questions`       | Extract Q&A patterns from threads                             |
| `suggest-actions.md`                | `suggest_actions`                | Suggest email actions (archive, reply, etc.)                  |
| `summarize-email-tldr.md`           | `summarize_email_tldr`           | Generate TL;DR summary                                        |
| `summarize-email-bullets.md`        | `summarize_email_bullets`        | Generate bullet-point summary                                 |
| `summarize-email-actions.md`        | `summarize_email_actions`        | Generate action-focused summary                               |
| `summarize-email-batch.md`          | `summarize_email_batch`          | Summarize multiple threads at once                            |
| `classify-email-type.md`            | `classify_email_type`            | Classify email for auto-responder                             |
| `generate-qa-answer.md`             | `generate_qa_answer`             | Generate auto-response from Q&A knowledge                     |
| `detect-opt-out.md`                 | `detect_opt_out`                 | Detect if sender opted out of auto-responses                  |
| `redact-names.md`                   | `redact_names`                   | Redact PII before sending to LLM                              |
| `validate-writing-example.md`       | `validate_writing_example`       | Validate writing style examples                               |
| `search-relevance-explanation.md`   | `search-relevance-explanation`   | Explain search result relevance                               |
| `search-query-conversion.md`        | N/A (promptfoo test only)        | Convert natural language to search query                      |
| `search-ranking.md`                 | N/A (promptfoo test only)        | Rank search results                                           |
| `consolidate-email-categories.md`   | `consolidate_categories`         | Merge duplicate/overlapping categories                        |
| `generate-categories-from-other.md` | `generate_categories_from_other` | Suggest new categories from "Other" emails                    |
| `check-category-duplicate.md`       | `check_category_duplicate`       | Determine if two category names are duplicates                |

### 8. `lastUserOperationAt` Pattern

When a user performs an action (archive, star, snooze) in BearlyMail, `lastUserOperationAt` is set on the EmailThread. During email sync, threads with this timestamp set are skipped to prevent the sync from overriding user intent. When a new email arrives in the thread, `lastUserOperationAt` is cleared to allow sync to resume.

### 9. Performance Budgets

Defined in `server/src/constants/performance-budgets.ts`. Key budgets:

- Inbox load (triage): 500ms total
- Thread query: 100ms (triage) / 300ms (action)
- Email query: 100ms
- Decryption: 100ms
- Batch status: 500ms

Use `PerformanceTracker` class for enforcement:

```typescript
const perf = new PerformanceTracker("getInbox(triage)");
const endSpan = perf.startSpan("combined_query", 200);
// ... work ...
endSpan();
perf.finish("triage");
```

### 10. Raw SQL for Performance

The inbox query uses raw SQL with `LATERAL JOIN` to fetch thread + email data in a single round-trip (eliminates N+1 queries). When using raw SQL, you lose TypeORM transformers, so manual decryption is required.

### 11. Migration Workflow

When adding/modifying database entities:

```bash
# 1. Modify entity file in server/src/database/entities/
# 2. Generate migration (auto-diffs entity vs DB):
cd server && npm run migration:generate src/database/migrations/DescriptiveName

# 3. Review the generated migration file
# 4. Run migration:
cd server && npm run migration:run

# Revert if needed:
cd server && npm run migration:revert
```

Migrations are timestamp-prefixed and run in order. In production, use `migration:run:prod` (runs from compiled `dist/`).

### 12. Context Analysis Pipeline

The multi-stage email analysis flow:

1. **Trigger**: User clicks "Analyze" → `POST /context/analyze` → enqueues `analyze-context` job
2. **Fetch phase** (0-10%): Fetches ~300 recent received + ~150 sent emails from provider
3. **Batch analysis** (10-70%): Processes emails in batches of 5 threads via LLM, extracting VIP contacts, projects, categories, urgency criteria
4. **Finalization** (70-99%): Consolidates duplicate categories, generates Q&A pairs from sent emails
5. **Complete** (100%): Results saved to `UserContext` table, progress tracked in `ContextAnalysis` table

Key services: `ContextService`, `ContextGmailDataService`, `ContextPiiRedactionService`, `ContextQaExtractionService`, `WritingStyleLearningService`

### 13. Auto-Responder System

Automated email response pipeline:

1. Email classified by type (`classify-email-type.md` prompt)
2. If Q&A-answerable: generates response from user's learned Q&A knowledge base
3. Checks for opt-out signals from sender (`detect-opt-out.md`)
4. Logs all auto-responses in `AutoResponseLog`, respects `AutoResponseSuppression` rules
5. Runs as low-priority background job

---

## Common Gotchas

This section highlights critical patterns and edge cases that commonly trip up AI assistants working with this codebase.

### Encryption in Raw SQL Queries

**Problem**: TypeORM column transformers (for encryption/decryption) don't work with raw SQL queries.

**Solution**: Always manually decrypt fields when using raw SQL:

```typescript
// ❌ WRONG - encrypted data returned
const rawEmails = await this.emailRepository.query(
  `SELECT "from", subject FROM emails WHERE ...`,
);

// ✅ CORRECT - decrypt each field
const rawEmails = await this.emailRepository.query(
  `SELECT "from", subject FROM emails WHERE ...`,
);
const decrypted = rawEmails.map((row) => ({
  from: EncryptionHelper.decrypt(row.from),
  subject: EncryptionHelper.decrypt(row.subject),
}));
```

### JSON Fields Need Decrypt-Then-Parse

**Problem**: Encrypted JSON fields (like `labels`, `priorityExplanation`, `attachments`) need both decryption and JSON parsing.

**Solution**: Decrypt first, then parse JSON:

```typescript
// ❌ WRONG - trying to parse encrypted string
const labels = JSON.parse(row.labels);

// ✅ CORRECT - decrypt then parse
const labels = JSON.parse(EncryptionHelper.decrypt(row.labels));
```

### Optimistic Updates and Flash-Back Prevention

**Problem**: Archived/snoozed emails briefly reappear in inbox when fetch completes before API call.

**Solution**: Check Redux `optimisticArchives` array when fetching emails:

```typescript
// In useEmailFetching hook
const optimisticIds = useSelector(selectOptimisticArchiveIds);
const filteredEmails = emails.filter((e) => !optimisticIds.includes(e.id));
```

### Thread vs Email: Where Fields Live

**Problem**: Star count, archive status, priority, and category are on `EmailThread`, NOT `Email`.

**Key fields on EmailThread**:

- `starCount` (0-3)
- `isArchived`, `isSnoozed`, `snoozeUntil`
- `priorityScore`, `priorityExplanation`
- `urgencyScore`, `urgencyExplanation`
- `category`, `categoryExplanation`
- `githubMetadata`
- `lastUserOperationAt`

**Key fields on Email**:

- `from`, `to`, `subject`, `body`, `htmlBody`
- `summary`, `attachments`, `labels`
- `isRead`, `receivedAt`

### Provider Routing

**Problem**: Don't call provider services (GmailProvider, Office365Provider, ZohoProvider) directly.

**Solution**: Always use `EmailProviderManager` which routes to the correct provider:

```typescript
// ❌ WRONG - hardcoded to Gmail
await this.gmailProvider.syncEmails(userId);

// ✅ CORRECT - auto-routes to user's provider
await this.emailProviderManager.syncEmails(userId);
```

### lastUserOperationAt Prevents Sync Overwrites

**Problem**: Email sync can override user actions (archive, star, snooze) if not careful.

**Solution**: The `lastUserOperationAt` timestamp on EmailThread prevents sync from touching threads the user recently modified. When a new email arrives in the thread, this timestamp is cleared to resume sync.

**Never manually clear this timestamp** unless you understand the implications.

### Prompt Files Location

**Problem**: LLM prompts are NOT in `server/src/promptfoo/prompts/`.

**Correct location**: `server/promptfoo/prompts/` (at server root, not inside `src/`).

When loading prompts, use:

```typescript
const prompt = await getPrompt("analyze_priority"); // loads from server/promptfoo/prompts/prioritise-email.md
```

### Performance Budget Violations

**Problem**: Inbox queries taking > 500ms in triage mode.

**Common causes**:

- Using TypeORM entities instead of raw SQL for list views
- Missing database indexes
- Decrypting fields you don't need
- N+1 queries (fetching related data in loops)

**Solution**: Use raw SQL with LATERAL JOIN for inbox, only decrypt displayed fields, add indexes.

---

## Decision Trees for AI Assistants

### When to use raw SQL vs TypeORM?

```
┌─ Is this a list view (inbox, search results)?
│  └─ YES → Use raw SQL + manual decrypt (performance critical)
│  └─ NO ─┐
│         └─ Is it a single record fetch by ID?
│            └─ YES → TypeORM is fine (auto-decrypt via transformers)
│            └─ NO ─┐
│                   └─ Is it a complex join query?
│                      └─ YES → Use raw SQL for performance
│                      └─ NO → TypeORM query builder is fine
```

### Which client hook manages what?

```
Email Management
├─ useInboxState (mega-hook: orchestrates all inbox hooks)
│  ├─ useEmailManagement (top-level email fetching & CRUD)
│  │  └─ useEmailFetching (core fetch logic, optimistic filtering)
│  ├─ useEmailActions (archive/star/snooze handlers)
│  │  └─ useEmailActionsBase (base implementations)
│  ├─ useBulkEmailActions (bulk operations with optimistic updates)
│  ├─ useEmailSelection (multi-select checkbox state)
│  ├─ useSplitView (side-by-side email view)
│  ├─ useKeyboardShortcuts (global keyboard shortcuts)
│  └─ useInboxKeyboardNavigation (arrow key navigation)
│
Email Detail
├─ useEmailDetail (main email detail page hook)
│  ├─ useEmailDetailFetching (fetch email + thread data)
│  ├─ useEmailDetailState (UI state: tabs, modals)
│  ├─ useEmailDetailOperations (archive, star, snooze APIs)
│  ├─ useEmailDetailReplies (reply composition + tone check)
│  ├─ useEmailDetailActionItems (action items display)
│  ├─ useEmailDetailNotes (private notes CRUD)
│  ├─ useEmailDetailGithub (GitHub metadata display)
│  └─ useEmailDetailToneCheck (tone check logic)
│
Other Features
├─ useFollowUps + useFollowUpPolling (follow-up mode)
├─ useTriageSuggestions (AI triage suggestions)
├─ useSearch (email search)
├─ useSnoozeInput (natural language snooze parsing)
├─ useStarCountHandler (star count change handling)
├─ useBatchSchedule (batch schedule display)
├─ useTabCounts (mode tab counts)
├─ useAutoResponder (auto-responder settings)
└─ useAdminDashboard (admin panel state)
```

### How to determine which LLM prompt to use?

| Task                              | Prompt File                    | Prompt ID                   |
| --------------------------------- | ------------------------------ | --------------------------- |
| Score email importance            | `prioritise-email.md`          | `analyze_priority`          |
| Extract VIP contacts, projects    | `analyze-email-patterns.md`    | `analyze_email_patterns`    |
| Generate single reply             | `generate-reply.md`            | `generate_reply`            |
| Generate multiple reply options   | `generate-multiple-replies.md` | `generate_multiple_replies` |
| Generate meeting scheduling reply | `generate-meeting-reply.md`    | `generate_meeting_reply`    |
| Generate follow-up email          | `generate-follow-up.md`        | `generate_follow_up`        |
| Check tone before sending         | `check-tone-style.md`          | `check_tone_style`          |
| Extract action items              | `extract-action-items.md`      | `extract_action_items`      |
| Summarize email (TL;DR)           | `summarize-email-tldr.md`      | `summarize_email_tldr`      |
| Summarize email (bullets)         | `summarize-email-bullets.md`   | `summarize_email_bullets`   |
| Auto-responder classification     | `classify-email-type.md`       | `classify_email_type`       |
| Auto-response from Q&A            | `generate-qa-answer.md`        | `generate_qa_answer`        |

### What inbox mode should I use for a query?

```
┌─ Is the email archived?
│  └─ YES → Not in any inbox mode (archived emails don't show in inbox)
│  └─ NO ─┐
│         └─ What is the starCount?
│            ├─ 0 → TRIAGE mode (new emails needing initial review)
│            └─ 1-3 ─┐
│                    └─ Did the user send the last message in the thread?
│                       ├─ YES → FOLLOW-UP mode (awaiting replies)
│                       └─ NO → ACTION mode (starred emails needing work)
```

---

## Constants Reference

All magic numbers are extracted to `server/src/constants/`:

| File                     | Contents                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| `query-limits.ts`        | `INBOX_TOTAL`, `INBOX_PROCESS_TOTAL`, `MAX_RESULTS_DEFAULT`, LLM limits          |
| `performance-budgets.ts` | Timing budgets for all operations                                                |
| `priority-constants.ts`  | `STAR_COUNTS`, `PRIORITY_SCORES`, `PRIORITY_BOOSTS`, `SENTIMENT_THRESHOLDS`      |
| `time-constants.ts`      | `DAYS`, `MINUTES`, `MILLISECONDS` multipliers                                    |
| `percentages.ts`         | `RATIOS` (e.g., `SMALL=0.10`, `SEVENTY_PERCENT=0.7`)                             |
| `llm-constants.ts`       | `TIME_FORMATTING`, `RECENCY_THRESHOLDS`, `QA_EXTRACTION`, `BODY_PREVIEW_LENGTHS` |
| `queue-constants.ts`     | Job queue configuration                                                          |
| `snooze-constants.ts`    | Snooze duration limits                                                           |
| `email-labels.ts`        | Gmail label name constants                                                       |
| `auth-constants.ts`      | Auth token expiry, etc.                                                          |

---

## API Endpoints (Key Routes)

All email endpoints require `JwtAuthGuard` + `GmailRequiredGuard`.

### Emails (`/emails`)

| Method | Path                                           | Description                                 |
| ------ | ---------------------------------------------- | ------------------------------------------- |
| GET    | `/emails/inbox?mode=triage\|action\|follow-up` | Get inbox emails                            |
| GET    | `/emails/tab-counts`                           | Get counts for each mode tab                |
| GET    | `/emails/batch-status`                         | Get next batch delivery time                |
| GET    | `/emails/search?q=...`                         | Search emails (LLM-ranked)                  |
| GET    | `/emails/stats?days=30`                        | Email analytics                             |
| GET    | `/emails/:id`                                  | Get single email (includes GitHub metadata) |
| GET    | `/emails/:id/thread`                           | Get all emails in thread                    |
| GET    | `/emails/:id/priority-explanation`             | Get priority breakdown                      |
| GET    | `/emails/:id/attachments/:attachmentId`        | Get attachment data                         |
| PUT    | `/emails/:id/archive`                          | Archive single email                        |
| PUT    | `/emails/:id/star-count`                       | Set star count (0-3)                        |
| PUT    | `/emails/:id/read`                             | Mark as read                                |
| PUT    | `/emails/:id/unread`                           | Mark as unread                              |
| POST   | `/emails/bulk/archive`                         | Bulk archive                                |
| POST   | `/emails/bulk/read`                            | Bulk mark as read                           |
| POST   | `/emails/force-check`                          | Trigger immediate email sync                |
| POST   | `/emails/check-urgent`                         | Check for urgent batched emails             |
| POST   | `/emails/:id/block-sender`                     | Block sender and archive                    |
| POST   | `/emails/:id/category-override`                | Override email category                     |
| POST   | `/emails/send`                                 | Send new email (with attachments)           |

### Context (`/context`)

| Method | Path                         | Description                    |
| ------ | ---------------------------- | ------------------------------ |
| GET    | `/context`                   | Get user's learned context     |
| POST   | `/context/analyze`           | Start email analysis           |
| GET    | `/context/analysis-progress` | Get analysis progress (0-100%) |
| POST   | `/context`                   | Create/update context entry    |
| DELETE | `/context/:id`               | Delete context entry           |

### LLM (`/llm`)

| Method | Path                            | Description                 |
| ------ | ------------------------------- | --------------------------- |
| GET    | `/llm/providers`                | Get available LLM providers |
| POST   | `/llm/suggest-replies`          | Generate reply options      |
| POST   | `/llm/check-tone`               | Check reply tone            |
| POST   | `/llm/summarize/:id`            | Summarize email             |
| POST   | `/llm/extract-action-items/:id` | Extract action items        |

### Other Key Routes

- `/auth/*` - Authentication (register, login, Google/Microsoft/Zoho OAuth)
- `/snooze/:id` - Snooze/unsnooze
- `/notes/thread/:threadId` - Private notes CRUD
- `/calendar/*` - Google Calendar integration
- `/follow-ups/*` - Follow-up drafts and bulk send
- `/batch-schedule/*` - Email batching schedule
- `/github/*` - GitHub integration settings

---

## Environment Variables

### Backend (`server/.env`)

| Variable                                                      | Required | Description                               |
| ------------------------------------------------------------- | -------- | ----------------------------------------- |
| `PORT`                                                        | No       | Server port (default: 3001)               |
| `NODE_ENV`                                                    | No       | Environment (development/production/test) |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | Yes      | PostgreSQL connection                     |
| `DB_SSL`                                                      | No       | Enable SSL (production)                   |
| `JWT_SECRET`                                                  | Yes      | JWT signing secret                        |
| `ENCRYPTION_KEY`                                              | Yes      | AES-256 encryption key (32+ chars)        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                    | Yes      | Google OAuth                              |
| `GOOGLE_REDIRECT_URI`                                         | Yes      | OAuth callback URL                        |
| `FRONTEND_URL`                                                | Yes      | Frontend URL for CORS                     |
| `LLM_PROVIDER`                                                | No       | Default LLM: `gemini`, `openai`, or `claude-cli` (local Claude Code CLI, no API key) |
| `CLAUDE_CLI_PATH`, `CLAUDE_CLI_MODEL`                         | No       | Claude Code CLI binary path (default `claude`) and model alias (default `sonnet`) for `claude-cli` |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                              | No       | Google Gemini config                      |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                              | No       | OpenAI config                             |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`            | No       | GitHub integration                        |
| `TERMS_VERSION`, `PRIVACY_VERSION`                            | No       | Consent tracking versions                 |
| `REVENUECAT_API_KEY`                                          | No       | Subscription management                   |
| `ZOHO_CLIQ_*`                                                 | No       | Zoho Cliq notifications                   |

### Frontend (`client/.env`)

| Variable                       | Required | Description                                    |
| ------------------------------ | -------- | ---------------------------------------------- |
| `REACT_APP_API_URL`            | Yes      | Backend URL (default: `http://localhost:3001`) |
| `REACT_APP_POSTHOG_API_KEY`    | No       | PostHog analytics                              |
| `REACT_APP_REVENUECAT_API_KEY` | No       | RevenueCat public key                          |

### Environment Variable Impact Matrix

This table shows what breaks if a required environment variable is missing:

| Feature                                | Required Env Vars                                                 | Impact if Missing                                      |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| **Application startup**                | `ENCRYPTION_KEY` (32+ chars)                                      | ❌ App won't start - critical security requirement     |
| **Database connection**                | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`     | ❌ App won't start - no database access                |
| **JWT authentication**                 | `JWT_SECRET`                                                      | ❌ Login/register fails - cannot sign tokens           |
| **Gmail OAuth**                        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | ❌ Cannot connect Gmail accounts                       |
| **Office365 OAuth**                    | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`                  | ❌ Cannot connect Office365 accounts                   |
| **Zoho OAuth**                         | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`                            | ❌ Cannot connect Zoho accounts                        |
| **Apple Mail (local)**                 | none — server must run on macOS beside Mail.app                   | ⚠️ Connect option hidden on non-macOS servers          |
| **LLM features (priority, summaries)** | `GEMINI_API_KEY` or `OPENAI_API_KEY`                              | ⚠️ Falls back to rule-based systems (reduced quality)  |
| **Calendar integration**               | Google OAuth + Calendar API scope                                 | ⚠️ Meeting scheduling replies disabled                 |
| **GitHub integration**                 | `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`                | ⚠️ GitHub PR/issue metadata extraction disabled        |
| **Subscriptions**                      | `REVENUECAT_API_KEY`                                              | ⚠️ Subscription features disabled                      |
| **Analytics**                          | `REACT_APP_POSTHOG_API_KEY`                                       | ⚠️ No usage analytics (app works fine)                 |
| **Waitlist notifications**             | `ZOHO_CLIQ_*` variables                                           | ⚠️ No Slack notifications for signups (app works fine) |
| **CORS**                               | `FRONTEND_URL`                                                    | ❌ Frontend cannot call API (CORS errors)              |
| **User's own OpenAI key**              | User sets `openAiApiKey` in profile                               | ⚠️ Uses system OpenAI key instead (if available)       |

**Key**: ❌ = App broken, ⚠️ = Feature disabled but app works

---

## Code Conventions & Rules

### Critical Rules (MUST follow)

1. **All user-facing text must use `t()` from `useTranslation()`** - add keys to both `en.json` and `es.json`
2. **Never hardcode LLM prompts** - use markdown files in `server/promptfoo/prompts/`
3. **Every new LLM prompt file MUST have a corresponding promptfoo test YAML** - add `<prompt-name>.yaml` in `server/promptfoo/` alongside the prompt. Tests must validate JSON structure, field types, and key behavioral cases (positive + negative). CI will run these on every PR.
4. **Always create migrations for schema changes** - never modify entities without a migration
5. **Sensitive data must be encrypted** - use `encryptedColumnTransformer` or `encryptedJsonTransformer`
6. **Verify TypeScript compilation** after changes: `cd server && npm run build` and `cd client && npm run build`
7. **Business logic in services, not controllers** - controllers only handle HTTP
8. **Use raw SQL for list views** (inbox, search) to avoid TypeORM entity hydration overhead
9. **Performance budgets** - monitor `server/logs/performance.log`

### PR Workflow & Autonomy (standing rule for AI assistants)

When a self-contained change is complete and verified (build, lint, and tests green), **open a PR for it without being asked** — this is a standing authorization, not something to request permission for each time.

- **Create the PR when you're confident** the change is correct and verified. Don't stop at "pushed" or leave the work uncommitted waiting for a go-ahead.
- **Then monitor the PR** and fix what comes back, without being asked:
  - **CI** via `gh pr checks <n>` — fix any failures.
  - **Automated review feedback** (Gemini / `gemini-code-assist`, or any review bot) via `gh api repos/<owner>/<repo>/pulls/<n>/comments` and `gh pr view <n> --json reviews` — apply valid findings; if a comment is wrong/stale/ambiguous, say why instead of blindly applying it.
  - Poll within the session (CI and bot reviews take minutes) rather than declaring done immediately.
- **Use an isolated git worktree off `main`** for a self-contained change that is unrelated to the branch currently checked out, on a branch named after the issue. Stay on the current branch only when the work is clearly a continuation of it.
- **Guardrails:** check a PR's merge state before pushing (never push to a merged/closed branch — branch off fresh `main` and open a new PR instead); never force-push a shared branch unless asked. Merging is the human's call unless they say otherwise.

Skip the auto-PR only if the user explicitly says not to, or the work is clearly not PR-ready (WIP, exploratory, or part of an existing open PR's branch).

### PR Screenshots for UI changes (ALWAYS)

**Every PR that changes the UI MUST include screenshots in the description** (before/after, or at least the "after", plus a narrow/mobile shot when layout/responsiveness is involved). Never ship a visual change without them — the reviewer should not have to run the app to see it.

- **Render it:** prefer a Storybook story (`cd client && npm run build-storybook`, serve `storybook-static`, then screenshot `iframe.html?id=<story-id>&viewMode=story` with Playwright — use the `e2e/` package's `playwright` and `chromium.launch({ channel: 'chrome' })`, since the bundled Chromium revision is often missing). Otherwise screenshot the running app.
- Attach the images to the PR via GitHub's own upload (drag-and-drop into the description) or any image host of your choice.

### Frontend Rules

- Use functional components with hooks
- Use `useRef` to track if data has been fetched (prevent duplicate calls)
- Use `useMemo` for derived values in dependency arrays
- Never use object/array literals (like `|| []`) in useEffect dependency arrays (creates new references)
- Load slow data (GitHub status, external APIs) asynchronously AFTER main UI renders
- UI must load in < 1 second
- Show loading states for all async operations
- Follow WCAG 2.1 AA accessibility compliance
- Support keyboard navigation

### Backend Rules

- Follow NestJS module pattern (module, controller, service, entity)
- Use NestJS Logger class (not console.log)
- Use NestJS exceptions (`UnauthorizedException`, `NotFoundException`, etc.)
- Add performance spans for major operations via `PerformanceTracker`
- Use raw SQL for performance-critical queries, manual decrypt as needed
- Never log encrypted/sensitive data
- Batch database operations when possible
- Use `Promise.all()` for parallel API calls

### Database Rules

- Always run migrations before deploying
- Add indexes for frequently queried columns
- Use the `check-and-add-indexes.ts` script to find missing indexes
- Prefer TypeORM query builder over `.find()` for complex queries
- Use transactions for atomic multi-table updates

---

## Working in Isolated Git Worktrees (AI assistants)

**Multiple AI agents may be working in this repo at the same time.** To avoid clobbering each other's changes, do self-contained tasks in an isolated git worktree off `main` — never edit in place on whatever branch happens to be checked out (it may hold another agent's unrelated WIP).

Place all worktrees under `~/dev/claude-worktrees/` (NOT alongside the repo in `~/dev/`), so the parent directory stays uncluttered. Create it first if needed (`mkdir -p ~/dev/claude-worktrees`).

```bash
git fetch origin
mkdir -p ~/dev/claude-worktrees
git worktree add ~/dev/claude-worktrees/bearlymail-<slug> -b fix/<slug> origin/main
```

**Rules:**

- **Name the branch and worktree after the issue** (`fix/category-rule-broken-badge`), never a random/auto-generated name. Use a unique, descriptive `<slug>` so two agents never land on the same worktree path.
- **Branch off the latest `origin/main`**, not the local checkout.
- **Treat an existing worktree as owned by another agent.** If `git worktree add` fails because the path exists, or files start changing under you (`Edit` reports "modified since read", or content hashes shift between reads), STOP — another agent owns it. Pick a different path or coordinate; do not race edits or remove their worktree.
- **Run tests in the worktree** by symlinking the installed deps (fast, no reinstall):
  ```bash
  ln -sfn "$(pwd)/server/node_modules" ~/dev/claude-worktrees/bearlymail-<slug>/server/node_modules
  ln -sfn "$(pwd)/client/node_modules" ~/dev/claude-worktrees/bearlymail-<slug>/client/node_modules
  ```
- **Verify, then commit and push from the worktree.** Confirm `npm run build` / tests / lint pass on the committed tip before reporting done.
- **Clean up your own worktree** when finished: `git worktree remove --force ~/dev/claude-worktrees/bearlymail-<slug>` (after the branch is pushed). `--force` is needed because the symlinked `node_modules` count as untracked files and otherwise block removal.
- **Before pushing, check the PR isn't already merged/closed** (`gh pr view <n> --json state,mergedAt`). If it is, branch off fresh `origin/main` and open a new PR rather than pushing dead commits.
- **Exception:** stay on the current branch only when the task is clearly a continuation of that branch's work.

See also the **Merge Conflicts** and **Multi-Run Tasks (Incremental Commits)** notes under [Troubleshooting](#troubleshooting).

---

## Testing

### Testing Philosophy

BearlyMail uses a multi-layered testing approach that balances coverage, speed, and reliability:

1. **Unit Tests** (Backend + Frontend): Fast, isolated, test individual functions and components
2. **Integration Tests** (Backend): Test module interactions with real database
3. **E2E Tests** (Playwright): Test complete user journeys with real backend
4. **LLM Prompt Tests** (Promptfoo): Test LLM prompt quality and consistency

**Coverage targets**:

- **80%+ for critical paths**: Authentication, email CRUD, inbox filtering, encryption, priority calculation
- **E2E for user-facing features**: Inbox, email actions, settings, onboarding
- **No E2E for admin features**: Use integration tests instead (faster, more reliable)

### Server Tests (Unit + Integration)

**Framework**: Jest with NestJS testing utilities

**Test location**: Co-located with source files (`.spec.ts`)

**Requirements**:

- PostgreSQL 17 service running (for integration tests)
- Test database separate from dev database

**Running tests**:

```bash
cd server
npm test                    # Run all tests
npm run test:cov -- --forceExit  # With coverage report
npm run test:watch          # Watch mode
npm run test:debug          # Debug mode
```

**Writing tests**:

```typescript
// Unit test example (mock dependencies)
describe("EmailsService", () => {
  let service: EmailsService;
  let mockRepository: jest.Mocked<Repository<Email>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailsService,
        { provide: getRepositoryToken(Email), useValue: mockRepository },
      ],
    }).compile();
    service = module.get(EmailsService);
  });

  it("should decrypt email fields", () => {
    // Test logic
  });
});

// Integration test example (real database)
describe("EmailsService Integration", () => {
  let app: INestApplication;
  let service: EmailsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule], // Real modules
    }).compile();
    app = module.createNestApplication();
    await app.init();
    service = module.get(EmailsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should fetch inbox emails from database", async () => {
    // Test with real DB
  });
});
```

### Client Tests (React Component Tests)

**Framework**: Vitest with React Testing Library (jsdom). Configured in `client/vitest.config.ts`; globals (`describe`/`it`/`expect`/`vi`) are enabled, and `mockReset` is on to mirror the previous Create React App Jest preset.

**Test location**: Co-located with components (`.test.ts` / `.test.tsx`)

**Philosophy**: Test user behavior, not implementation details

**Running tests**:

```bash
cd client
npm test                              # Run once (Vitest, CI mode)
npm run test:watch                    # Interactive watch mode
npm test -- --passWithNoTests         # CI mode (tolerate no tests)
npm run test:coverage                 # With coverage
```

**Writing tests**:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxPage } from './InboxPage';

test('should mark email as read when clicked', async () => {
  render(<InboxPage />);

  const email = screen.getByTestId('email-item-1');
  fireEvent.click(email);

  expect(await screen.findByText('Read')).toBeInTheDocument();
});
```

**Best practices**:

- ✅ Use `data-testid` for test selectors
- ✅ Test user-visible behavior (what user sees/does)
- ✅ Use `findBy*` for async elements (waits for element)
- ✅ Mock API calls with MSW or jest mocks
- ❌ Don't test implementation (internal state, prop drilling)
- ❌ Don't use brittle selectors (CSS classes, element order)

### E2E Tests (Playwright)

**Framework**: Playwright with Page Object Model

**Test location**: `e2e/tests/`

**Page objects**: `e2e/pages/` (LoginPage, InboxPage, EmailDetailPage, etc.)

**Test user**: `test@example.com` / `testpassword` (seed: `cd server && npm run seed:test-user`)

**Running tests**:

```bash
cd e2e
npm test                  # Headless mode
npm run test:ui           # UI mode (interactive)
npm run test:headed       # Headed browser (see what's happening)
npm run test:watch        # Watch mode
npm run test:debug        # Debug mode with Playwright Inspector
```

**Writing effective E2E tests**:

✅ **DO**:

- Use Page Object Model (pages in `e2e/pages/`)
- Use `data-testid` selectors for stability
- Test complete user flows (login → action → verify result)
- Check performance (page load times, network requests)
- Test accessibility (keyboard nav, ARIA labels)
- Wait for elements properly (`waitForSelector`, `waitForLoadState`)

❌ **DON'T**:

- Use brittle CSS selectors (prefer `data-testid`)
- Test implementation details (test behavior users see)
- Mock external services in E2E (use real test accounts)
- Skip accessibility checks (test keyboard navigation)
- Make tests depend on each other (tests must be independent)

**Example E2E test**:

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { InboxPage } from "../pages/InboxPage";

test("should archive email from inbox", async ({ page }) => {
  // Login
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login("test@example.com", "testpassword");

  // Navigate to inbox
  const inboxPage = new InboxPage(page);
  await inboxPage.waitForInboxToLoad();

  // Archive first email
  const emailCount = await inboxPage.getEmailCount();
  await inboxPage.archiveFirstEmail();

  // Verify email removed
  expect(await inboxPage.getEmailCount()).toBe(emailCount - 1);
});
```

**Performance testing in E2E**:

```typescript
test("inbox should load within performance budget", async ({ page }) => {
  const startTime = Date.now();

  await inboxPage.waitForInboxToLoad();

  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(1000); // 1 second budget
});
```

### LLM Prompt Tests (Promptfoo)

**Framework**: Promptfoo

**Purpose**: Test LLM prompt quality, consistency, and regression

**Location**: `server/promptfoo/` (config, prompts, test cases)

**Requirements**: `OPENAI_API_KEY` environment variable

**Running tests**:

```bash
cd server
npm run promptfoo:test      # Run all prompt tests
npm run promptfoo:eval      # Evaluate and compare results
npm run promptfoo:view      # View results in web UI
```

**What we test**:

- Prompt output quality (does it extract correct info?)
- Consistency across similar inputs
- Regression (did changes break existing behavior?)
- Edge cases (empty emails, very long emails, special characters)

**Example test case** (in `server/promptfoo/prompts.test.yaml`):

```yaml
prompts:
  - file://prompts/prioritise-email.md

providers:
  - openai:gpt-4

tests:
  - description: Should score urgent email high
    vars:
      email_subject: "URGENT: Production is down"
      email_body: "Our production server is completely offline"
    assert:
      - type: javascript
        value: output.score >= 80

  - description: Should score newsletter low
    vars:
      email_subject: "Weekly Newsletter"
      email_body: "Here's what happened this week..."
    assert:
      - type: javascript
        value: output.score <= 30
```

### Test Coverage Requirements

| Component                | Coverage Target    | Notes                             |
| ------------------------ | ------------------ | --------------------------------- |
| **Authentication**       | 90%+               | Critical security path            |
| **Email CRUD**           | 85%+               | Core functionality                |
| **Encryption**           | 95%+               | Security critical                 |
| **Priority calculation** | 80%+               | LLM-dependent, hard to test       |
| **Inbox filtering**      | 90%+               | Core user experience              |
| **Email sync**           | 75%+               | Provider-dependent                |
| **Frontend components**  | 70%+               | Visual components, harder to test |
| **LLM prompts**          | 100% (all prompts) | Quality assurance                 |

### CI Pipeline Testing

All tests must pass before merging to `main`:

| CI Job              | What it runs                                | Failure impact               |
| ------------------- | ------------------------------------------- | ---------------------------- |
| `server-coverage`   | Backend unit + integration tests            | ❌ PR blocked                |
| `client-tests`      | Frontend component tests                    | ❌ PR blocked                |
| `server-lint`       | Backend ESLint                              | ❌ PR blocked                |
| `client-lint`       | Frontend ESLint                             | ❌ PR blocked                |
| `client-build`      | Frontend production build                   | ❌ PR blocked                |
| `server-smoke-test` | Server builds, migrations run, health check | ❌ PR blocked                |
| `promptfoo-tests`   | LLM prompt quality tests                    | ❌ PR blocked (can be flaky) |

**Note**: E2E tests are NOT run in CI (too slow, too flaky). Run manually before major releases.

---

## Infrastructure (AWS CDK)

### Stack Architecture

1. **NetworkingStack**: VPC, Route53, ACM certificates
2. **DatabaseStack**: RDS PostgreSQL (private subnet)
3. **MainStack** (`BearlyMailStack`):
   - ECS Fargate: Web service (NestJS API behind ALB)
   - ECS Fargate: Worker service (background jobs)
   - EventBridge: Cron scheduled tasks
   - ECS Task: Migration runner (manual)
   - S3 + CloudFront: Frontend hosting
4. **GitHubActionsStack**: OIDC provider for CI/CD

### Deployment (`.github/workflows/deploy.yml`)

Triggered on push to `main`. Steps:

1. Build React client
2. Build and push Docker image to ECR
3. CDK deploy infrastructure
4. Force new ECS deployment
5. Run database migrations
6. Sync frontend to S3 + invalidate CloudFront

---

## Troubleshooting

### Common Issues

#### Encryption Errors

**Symptom**: `Error: Invalid encrypted data` or `Error: Encryption key not set`

**Causes**:

- `ENCRYPTION_KEY` env var missing or < 32 characters
- Trying to decrypt data that was encrypted with a different key
- Raw SQL query returning encrypted data without manual decryption

**Fixes**:

1. Verify `ENCRYPTION_KEY` is set: `echo $ENCRYPTION_KEY | wc -c` (should be 64+ chars for hex)
2. For raw SQL queries, manually decrypt with `EncryptionHelper.decrypt(row.field)`
3. For JSON fields, decrypt then parse: `JSON.parse(EncryptionHelper.decrypt(row.labels))`
4. Never change `ENCRYPTION_KEY` after data is encrypted (you'll lose access to all encrypted data)

#### Performance Budget Violations

**Symptom**: Warnings in `server/logs/performance.log` like `"getInbox(triage) exceeded budget: 750ms > 500ms"`

**Common causes**:

- Missing database index (run `npm run check-indexes` to find missing indexes)
- Using TypeORM entities for list queries (switch to raw SQL)
- N+1 queries (fetching related data in loops instead of JOIN)
- Decrypting too many fields (only decrypt what you display)
- Slow external API calls blocking the response

**Fixes**:

1. Check slow queries: Look for queries > 100ms in logs
2. Add missing indexes: `npm run check-indexes` then create migration
3. Use raw SQL for inbox/search: See `getInbox()` implementation
4. Only decrypt displayed fields: Skip decrypting `body`, `htmlBody` in list views
5. Run external calls async: Don't block inbox load for GitHub status, etc.

#### Migration Conflicts

**Symptom**: `QueryFailedError: relation "table_name" already exists` when running migrations

**Causes**:

- Database state doesn't match migration history
- Migration was partially applied then failed
- Manual schema changes made outside migrations

**Fixes**:

1. Check applied migrations: `psql -d adhd_email_client -c "SELECT * FROM migrations ORDER BY id;"`
2. Check actual tables: `psql -d adhd_email_client -c "\dt"`
3. If table exists but migration not recorded: Manually insert migration record or drop table
4. If migration partially applied: Manually revert changes then re-run migration
5. **Never modify database schema manually** - always use migrations

#### Optimistic Update Flash-Back

**Symptom**: Archived email briefly reappears in inbox list, then disappears again

**Cause**: Email fetch completed before archive API call, so fresh data doesn't include optimistic archive

**Fix**: Check Redux `optimisticArchives` array in `useEmailFetching` hook:

```typescript
const optimisticIds = useSelector(selectOptimisticArchiveIds);
const filteredEmails = emails.filter((e) => !optimisticIds.includes(e.id));
```

This is already implemented - if you're still seeing flash-back, check that:

1. `addOptimisticArchive` is called immediately when archive button clicked
2. `removeOptimisticArchive` is called after API succeeds/fails
3. Email list re-renders after fetch completes

#### Sync Overriding User Actions

**Symptom**: User archives an email, but sync un-archives it minutes later

**Cause**: Email sync is overriding `lastUserOperationAt` protection

**Fixes**:

1. Verify `lastUserOperationAt` is set on EmailThread when user takes action
2. Check email sync skips threads with recent `lastUserOperationAt` (within last 5 minutes)
3. Ensure `lastUserOperationAt` is cleared only when new email arrives in thread
4. Check logs for "Skipping thread due to lastUserOperationAt" messages

**Debug**:

```sql
SELECT "threadId", "lastUserOperationAt", "updatedAt"
FROM email_threads
WHERE "userId" = 'user-uuid' AND "lastUserOperationAt" IS NOT NULL;
```

#### Stuck "Calculating..." Priority

**Symptom**: Email shows "Calculating..." for priority score indefinitely

**Cause**: `isProcessingPriority` flag on EmailThread stuck at `true` (job failed or worker crashed)

**Fixes**:

1. The inbox has a 10% random chance auto-fix on each load
2. Use admin endpoint: `POST /emails/fix-stuck-calculating`
3. Manually fix: `UPDATE email_threads SET "isProcessingPriority" = false WHERE "isProcessingPriority" = true;`
4. Check worker logs for failed `refine-priority` jobs

#### Worker Not Processing Jobs

**Symptom**: Emails not syncing, summaries not generating, priorities stuck

**Causes**:

- Worker process not running
- PgBoss schema not created
- Database connection failed
- Worker crashed and didn't auto-respawn

**Fixes**:

1. Check if worker is running: `ps aux | grep worker` or check ECS task status
2. Check worker logs: `tail -f server/logs/worker.log`
3. Verify PgBoss schema exists: `psql -d adhd_email_client -c "\dt pgboss.*"`
4. Restart worker: Worker auto-respawns via cluster mode, but may need manual restart
5. Check for exceptions in worker logs

#### Test Failures

**Symptom**: Playwright tests fail with "Timeout waiting for element" or "Network request failed"

**Common causes**:

- Test user not seeded in database
- Database not running
- Backend not started or wrong port
- `REACT_APP_API_URL` pointing to wrong backend
- Frontend not built or running

**Fixes**:

1. Seed test user: `cd server && npm run seed:test-user`
2. Start database: `npm run db:up`
3. Start backend: `cd server && npm run start:dev`
4. Verify backend is up: `curl http://localhost:3001/health`
5. Check `REACT_APP_API_URL` in test environment
6. Run tests in headed mode to debug: `cd e2e && npm run test:headed`

#### LLM Request Failures

**Symptom**: Summaries, priorities, or replies fail with "LLM provider error"

**Causes**:

- API key missing, invalid, or rate-limited
- Model name incorrect
- Request timeout
- Content violates LLM provider policies

**Fixes**:

1. Verify API keys: `echo $GEMINI_API_KEY` and `echo $OPENAI_API_KEY`
2. Check model names: `GEMINI_MODEL=gemini-pro`, `OPENAI_MODEL=gpt-4`
3. Test LLM providers: `GET /llm/providers`
4. Check rate limits in provider dashboard
5. System automatically falls back between Gemini ↔ OpenAI on failure
6. Users can provide their own `openAiApiKey` in profile as fallback

#### Merge Conflicts

**Symptom**: PR branch is behind `main` and has conflicting changes, or CI fails due to outdated code.

**Context**: When working on feature branches, `main` may receive new commits that conflict with your changes. AI assistants running in CI (shallow clones) need extra steps to resolve conflicts.

**Resolution steps**:

1. **Unshallow the clone** (CI runners use shallow clones by default):

   ```bash
   git fetch --unshallow origin || true
   ```

2. **Fetch the latest main**:

   ```bash
   git fetch origin main
   ```

3. **Merge main into your feature branch** (do NOT rebase — AI assistants cannot perform interactive rebases):

   ```bash
   git merge origin/main
   ```

4. **Resolve conflicts** if any:
   - Read the conflicting files to understand both sides
   - Edit files to resolve conflicts (remove `<<<<<<<`, `=======`, `>>>>>>>` markers)
   - Ensure the merged result includes changes from both sides where appropriate
   - Stage resolved files: `git add <resolved-files>`
   - Complete the merge: `git commit --no-edit`

5. **Push the resolved merge**:
   ```bash
   git push origin HEAD
   ```

**Important notes**:

- Always prefer `git merge` over `git rebase` when resolving conflicts in CI/automated contexts
- Never force push (`--force`) unless explicitly asked by the user
- After resolving conflicts, run linting and tests to ensure the merge didn't break anything
- If the clone is too shallow to merge, `git fetch --unshallow` is required first
- When conflict resolution is too complex (e.g., large refactors on both sides), explain the situation and let the human developer handle it

#### Multi-Run Tasks (Incremental Commits)

**Context**: Some tasks (e.g., ESLint cleanup, large refactors) span multiple hours and may exceed a single GitHub Action run's time budget.

**Rule**: For long-running tasks, **commit and push after each logical batch of changes**. This ensures:

- Work is never lost if the GitHub Action run times out
- Progress is visible in the PR history
- The next run can resume from where the previous one left off

**Pattern**:

1. Complete a logical unit of work (e.g., "fix all no-unused-vars in providers")
2. Commit with a descriptive message: `git commit -m "refactor: fix no-unused-vars in provider files"`
3. Push immediately: `git push origin HEAD`
4. Continue to the next batch

**Do not wait** until all changes are done before committing. Prefer many small commits over one large one for long tasks.
