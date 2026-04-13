# Plan: Lambda for Initial Email Prioritisation (#1703)

> **Status:** PLANNED
> **Author:** Monk of Modularity (AI agent)
> **Created:** 2026-04-09
> **Labels:** `ready-for-codebeard`, `planned`

## Problem

Email prioritisation currently runs **on the ECS server** via PgBoss jobs (`refine-priority`, `refine-priority-batch`). The LLM calls in `PriorityAnalysisService.analyzePriority()` and `analyzePriorityBatch()` are processed sequentially (or with limited PgBoss concurrency), creating the same bottleneck that context analysis had before issue #1445 moved it to Lambda.

The context analysis pipeline already has a working SQS → Lambda pattern (`bearlymail-context-analysis.fifo` → `bearlymail-batch-analyzer`). We need to **replicate this pattern** for email prioritisation with a **separate SQS queue and a separate Lambda function** to avoid contention between the two workloads.

**Key requirement from the issue:** The prompt must be loaded from a `.md` file (bundled with the Lambda), not hardcoded, to stay in sync with the server's `prioritise-email.md`.

## Current Architecture

### Context Analysis (Lambda — already working)
```
ECS (ContextSqsDispatchService)
  → SQS FIFO: bearlymail-context-analysis.fifo
    → Lambda: bearlymail-batch-analyzer (×60 concurrent)
      → Reads prompts/analyze-email-patterns.md
      → Calls LLM API
      → Writes results to RDS via RDS Proxy
```

### Email Prioritisation (Server — current, to be moved)
```
ECS (LLMPriorityBatchService.runBatchRefinement)
  → PgBoss: refine-priority-batch
    → PriorityAnalysisService.analyzePriorityBatch()
      Phase 1: Triage (cheap model, batch-priority-triage.md)
      Phase 2: Individual analysis (prioritise-email.md per email)
    → LLMPriorityResultService.applyPriorityResult()
```

### Key Server Files Involved
| File | Role |
|---|---|
| `server/src/emails/llm-priority-batch.service.ts` | Orchestrates batch priority processing via PgBoss |
| `server/src/llm/priority-analysis.service.ts` | Builds prompts, calls LLM, parses results |
| `server/src/emails/llm-priority-result.service.ts` | Applies priority results to DB |
| `server/src/emails/stuck-priority-detection.service.ts` | Detects threads stuck in processing |
| `server/promptfoo/prompts/prioritise-email.md` | Priority analysis prompt template |
| `server/promptfoo/prompts/batch-priority-triage.md` | Triage prompt (decides which emails need reanalysis) |
| `server/src/llm/prompts.ts` | Prompt loading registry (maps file names → prompt IDs) |
| `server/src/constants/job-names.ts` | PgBoss job name constants |

### Key Infrastructure Files
| File | Role |
|---|---|
| `infrastructure/lib/bearlymail-context-analysis-stack.ts` | Existing SQS + Lambda stack (template for new stack) |
| `infrastructure/lib/bearlymail-stack.ts` | ECS app stack, wires queue URLs to containers |
| `infrastructure/bin/app.ts` | CDK app entry, orchestrates stack dependencies |

## Design

### Architecture (Target)
```
ECS (PrioritySqsDispatchService — new)
  → SQS FIFO: bearlymail-email-prioritisation.fifo (new)
    → Lambda: bearlymail-email-prioritiser (new, ×30 concurrent)
      → Reads prompts/prioritise-email.md (bundled .md file)
      → Calls LLM API (same provider logic as batch-analyzer)
      → Writes priority results to RDS via RDS Proxy
  ← ECS polls/listens for completion (or Lambda writes directly)
```

### Two-Phase Processing in Lambda

The current server-side prioritisation has two phases that both need to move:

1. **Triage phase** (cheap model, `batch-priority-triage.md`): Determines which emails in a batch actually need full reanalysis. Emails with stable scores are preserved.
2. **Individual analysis phase** (`prioritise-email.md`): Full priority scoring per email flagged by triage.

**Approach:** The Lambda function handles **both phases** internally for its batch:
- Receives a batch of emails via SQS
- Runs triage to filter which need reanalysis
- Runs individual analysis on flagged emails
- Writes results to RDS

This keeps the same logic but parallelises across Lambda invocations (one per batch).

### Separate Queue & Lambda (No Contention)

The issue explicitly requests a **different SQS queue and potentially a different Lambda function** to avoid contention with context analysis. This is the right call:
- Context analysis batches are large (10 threads × rich payload) and take ~15-30s
- Priority batches are smaller payloads but higher throughput
- Separate reserved concurrency limits prevent one workload starving the other
- Independent DLQs and CloudWatch alarms for better observability

## Implementation Steps

### Step 1: New CDK Stack — `BearlyMailEmailPrioritisationStack`

Create `infrastructure/lib/bearlymail-email-prioritisation-stack.ts` modelled on `bearlymail-context-analysis-stack.ts`:

- **SQS FIFO queue:** `bearlymail-email-prioritisation.fifo`
  - Visibility timeout: 120s (priority LLM calls are faster than context analysis)
  - Retention: 4h
  - DLQ: `bearlymail-email-prioritisation-dlq.fifo` (maxReceiveCount: 3)
- **Lambda function:** `bearlymail-email-prioritiser`
  - Runtime: Node.js 20.x
  - Memory: 512MB
  - Timeout: 90s
  - Reserved concurrency: 30 (lower than context analysis; can be tuned)
  - Code: `lambda/email-prioritiser/dist`
  - Environment:
    - `RDS_PROXY_ENDPOINT` (from DatabaseStack)
    - `DB_SECRET_ARN` (from DatabaseStack)
    - `APP_SECRET_ARN` (from SecretsStack)
    - `PRIORITISE_PROMPT_PATH`: `/var/task/prompts/prioritise-email.md`
    - `TRIAGE_PROMPT_PATH`: `/var/task/prompts/batch-priority-triage.md`
  - VPC: private subnets with egress
  - Security group: reuse `lambdaSecurityGroup` from DatabaseStack
  - SQS event source: batchSize 1
- **CloudWatch alarms:** DLQ depth + Lambda error rate (same pattern as context analysis)
- **Outputs:** Queue URL, DLQ URL, Lambda ARN

Wire into `infrastructure/bin/app.ts`:
- Instantiate `BearlyMailEmailPrioritisationStack` after `databaseStack`, before `appStack`
- Pass the new queue to `BearlyMailStack` as `emailPrioritisationQueue`
- Add `EMAIL_PRIORITISATION_SQS_QUEUE_URL` env var to ECS task definitions

### Step 2: New Lambda — `lambda/email-prioritiser/`

Create `lambda/email-prioritiser/` with the same structure as `lambda/batch-analyzer/`:

```
lambda/email-prioritiser/
├── package.json
├── tsconfig.json
├── prompts/
│   ├── prioritise-email.md      ← COPY from server/promptfoo/prompts/
│   └── batch-priority-triage.md ← COPY from server/promptfoo/prompts/
└── src/
    ├── handler.ts    ← SQS event handler
    ├── llm.ts        ← LLM client (triage + individual analysis)
    ├── db.ts         ← RDS Proxy writes (priority results)
    ├── secrets.ts    ← Reuse/copy from batch-analyzer
    └── types.ts      ← Payload types
```

**`handler.ts`**: Mirrors `batch-analyzer/src/handler.ts` but calls priority analysis:
1. Parse SQS message → `PriorityBatchPayload`
2. Run triage phase (cheap model) on emails with existing scores
3. Run individual analysis (smart model) on flagged emails
4. Write results to RDS: update `email_thread.urgency_score`, `priority_explanation`, category, etc.
5. Emit CloudWatch metrics (`LambdaPriorityBatchSuccess`, `LambdaPriorityBatchFailure`, etc.)

**`llm.ts`**: Port the prompt-building and LLM-calling logic from `PriorityAnalysisService`:
- Load `prioritise-email.md` from bundled file (via `PRIORITISE_PROMPT_PATH` env var)
- Load `batch-priority-triage.md` from bundled file (via `TRIAGE_PROMPT_PATH` env var)
- Build prompts using the same template variable substitution
- Call LLM (Anthropic/OpenAI/Gemini) with the same parameters
- Parse JSON responses with the same fallback logic

**`db.ts`**: Write priority results to RDS via RDS Proxy:
- Update `email_thread` table: `urgency_score`, `goal_alignment_score`, `category_id`, `priority_explanation` (JSONB), `is_processing_priority = false`
- Handle triage-preserved emails (no-op, just unlock)
- Handle fallback entries (mark for retry)

**Prompt files:** Copy `server/promptfoo/prompts/prioritise-email.md` and `batch-priority-triage.md` into `lambda/email-prioritiser/prompts/`. These are the **source of truth** — the Lambda reads them at runtime from the bundled deployment package.

> ⚠️ **Keeping prompts in sync:** Both the server and Lambda need the same prompt files. Options:
> - **Option A (recommended):** Keep prompts in `server/promptfoo/prompts/` as the source of truth. The Lambda build step copies them into `lambda/email-prioritiser/prompts/` before packaging. A CI check verifies they match.
> - **Option B:** Move prompts to a shared `prompts/` top-level directory and symlink/copy into both locations.
> 
> Go with **Option A** — it's the same approach used by context analysis (`lambda/batch-analyzer/prompts/analyze-email-patterns.md` is a copy) and doesn't require restructuring.

### Step 3: New Server-Side Dispatch Service — `PrioritySqsDispatchService`

Create `server/src/emails/priority-sqs-dispatch.service.ts` modelled on `ContextSqsDispatchService`:

- Inject a new `PrioritySqsService` (or extend `SqsService` to support multiple queues via `EMAIL_PRIORITISATION_SQS_QUEUE_URL`)
- Build `PriorityBatchPayload` messages containing:
  - `userId`, `batchIndex`, `totalBatches`
  - Array of email payloads (same shape as `buildBatchEmailPayloads()` output)
  - `userContext` (urgent items, goals, working on, don't care, email categories, proto-categories)
  - `analysisRecordId` (for tracking/correlation)
- Send to `bearlymail-email-prioritisation.fifo` via `sendMessageBatch()`
- Each batch gets a unique `MessageGroupId` for parallel Lambda processing

### Step 4: Update `SqsService` to Support Multiple Queues

The current `SqsService` is hardcoded to `CONTEXT_ANALYSIS_SQS_QUEUE_URL`. Extend it:

**Option A (preferred):** Add a second queue URL property and methods:
```typescript
private readonly prioritisationQueueUrl: string | undefined;

constructor(configService: ConfigService) {
  // ... existing
  this.prioritisationQueueUrl = configService.get<string>(
    'EMAIL_PRIORITISATION_SQS_QUEUE_URL',
  );
}

async sendPrioritisationMessage(...) { /* same as sendMessage but uses prioritisationQueueUrl */ }
async sendPrioritisationMessageBatch(...) { /* same pattern */ }
```

**Option B:** Make queue URL a parameter on `sendMessage()` / `sendMessageBatch()`. Less safe but more flexible.

Go with **Option A** — explicit methods are safer and match the "no contention" principle.

### Step 5: Modify `LLMPriorityBatchService` to Dispatch via SQS

Update `llm-priority-batch.service.ts`:

- In `runBatchRefinement()`, after `prepareBatchEmails()` and `filterEmailsHandledIncrementally()`:
  - Instead of calling `this.priorityAnalysisService.analyzePriorityBatch()` directly
  - Build payloads and dispatch to SQS via `PrioritySqsDispatchService`
  - The Lambda writes results directly to RDS
- Add a completion tracking mechanism:
  - **Option A:** Lambda writes a "batch complete" marker to the DB. Server polls/checks via a finalizer (like `ContextAnalysisFinalizerService`).
  - **Option B:** Lambda sends completion messages to a response SQS queue. Server listens.
  - **Recommended: Option A** — matches the context analysis pattern. Create a `priority_analysis` tracking table or add columns to `email_thread` for batch tracking.

### Step 6: Priority Analysis Tracking & Finalisation

Create `server/src/emails/priority-analysis-finalizer.service.ts`:
- Polls for completion of all batches in a priority analysis run
- Unlocks threads (`isProcessingPriority = false`) once all batches complete
- Handles failed batches (requeue via PgBoss for retry, respecting `MAX_PRIORITY_RETRIES`)

### Step 7: CI/CD Updates

- **Lambda build:** Add `lambda/email-prioritiser` to the CI build pipeline (same as `lambda/batch-analyzer`)
  - `npm ci && npm run build` in `lambda/email-prioritiser/`
  - Copy prompt files from `server/promptfoo/prompts/` into `lambda/email-prioritiser/prompts/` during build
- **CDK deploy:** Include `BearlyMailEmailPrioritisationStack` in deploy workflow
- **Prompt sync check:** Add a CI step that verifies `lambda/email-prioritiser/prompts/*.md` matches `server/promptfoo/prompts/*.md` (diff check, fail if out of sync)

### Step 8: Gradual Rollout & Fallback

Add a feature flag `USE_LAMBDA_PRIORITISATION` (env var on ECS):
- `true`: Dispatch priority batches to SQS → Lambda
- `false` (default): Use existing PgBoss → server-side LLM calls
- This allows safe rollout and instant rollback if Lambda prioritisation has issues

## Payload Schema

### SQS Message: `PriorityBatchPayload`

```typescript
interface PriorityBatchPayload {
  userId: string;
  batchIndex: number;
  totalBatches: number;
  analysisId: string; // Correlation ID for tracking
  
  // Emails in this batch
  emails: Array<{
    emailKey: string;      // email.id
    from: string;
    fromName?: string;
    senderJobTitle?: string;
    subject: string;
    body: string;           // Cleaned/summarised body
    preComputedSentimentScore?: number;
    existingUrgencyScore?: number;
    existingCategory?: string;
  }>;
  
  // User context (shared across all emails in batch)
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
    emailCategories: Array<{ name: string; description?: string; categoryKey?: string }>;
    protoCategories: Array<{ name: string; description?: string; categoryKey?: string }>;
  };
}
```

### Lambda → RDS: Priority Result Write

For each email in the batch, the Lambda writes:
```sql
UPDATE email_thread SET
  urgency_score = $1,
  goal_alignment_score = $2,
  category_id = $3,
  priority_explanation = $4::jsonb,
  is_processing_priority = false,
  updated_at = NOW()
WHERE id = $5;
```

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Prompt drift** between server and Lambda | CI sync check (Step 7); single source of truth in `server/promptfoo/prompts/` |
| **Category shortlisting** not available in Lambda | The Lambda should include the category shortlist logic or receive pre-shortlisted categories in the payload. Since shortlisting uses a cheap LLM call, including it in the Lambda is feasible. |
| **DB connection exhaustion** with 30+ concurrent Lambdas | RDS Proxy (already in use for context analysis) handles connection pooling. Monitor `max_connections` usage. |
| **SQS message size limit** (256KB for FIFO) | Priority payloads are smaller than context analysis (no full email bodies, just summaries). Should be well within limits. If not, truncate body previews. |
| **Feature flag complexity** | Keep the fallback path (PgBoss) intact until Lambda path is proven stable. Remove after 2 weeks of clean operation. |
| **Proto-category suggestion** writes | Lambda needs write access to proto-categories table or must include suggestions in the result for the server finalizer to apply. Recommend: Lambda writes to a `priority_batch_result` staging table; server finalizer applies proto-category suggestions. |

## Out of Scope

- Migrating the **triage suggestions** service to Lambda (separate concern)
- Changing the priority scoring algorithm itself
- Modifying the prompt content (only moving where it's loaded from)
- Migrating incremental priority checks to Lambda (these are lightweight single-email checks that don't benefit from Lambda parallelism)

## Testing

1. **Unit tests:** Lambda handler with mocked SQS events, LLM responses, and DB writes
2. **Integration test:** End-to-end SQS → Lambda → RDS flow in staging
3. **Smoke test:** CI deploys Lambda, sends a test message, verifies response (same pattern as context analysis smoke test)
4. **Comparison test:** Run both PgBoss and Lambda paths on same emails, compare results for parity
5. **Load test:** Simulate burst of 100+ emails across 5 users, verify Lambda scaling and RDS Proxy connection pool
