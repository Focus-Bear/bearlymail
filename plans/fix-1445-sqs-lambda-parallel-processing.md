# Plan: SQS + Lambda for Parallel Email Analysis (#1445)

> **Status:** IN-PROGRESS  
> **Author:** Monk of Modularity (AI agent) + Captain Codebeard (AI agent)  
> **Created:** 2026-03-24  
> **Updated:** 2026-03-24  
> **Labels:** `in-progress`, `ready-for-review`

## Problem

New user onboarding is too slow. The context analysis pipeline (which learns user email patterns, VIP contacts, writing style, and categories) processes emails **sequentially via PgBoss** on the server.

Current flow:

1. `OnboardingService.startHistoricalScan()` → queues `scan-history` job
2. `ScanAnalysisProcessor` → runs `analyzeScanResults()` (enrichment, VIP, categories, context)
3. `ContextAnalysisOrchestratorService.analyzeAndLearnFromEmails()` → fetches threads, builds batches of 10 threads, enqueues `analyze-context-batch` jobs via PgBoss
4. `ContextBatchAnalysisProcessor` → processes each batch: fetch threads → LLM analysis → save results (concurrency limited by CPU cores × 2, max 10)
5. `ContextFinalizationProcessor` → polls until all batches complete, then runs post-processing

**Bottleneck:** With 300 general + 150 sent threads → ~30-45 batches of 10. PgBoss concurrency is capped at `Math.max(3, Math.min(cpuCores * 2, 10))` = **~6-10 concurrent jobs** on a single ECS Fargate task. Each batch takes ~15-30s (mostly LLM wait time). Total: **5-15 minutes** for onboarding analysis.

**Goal:** Process all ~30 batches simultaneously via SQS + Lambda → reduce to **~30-60 seconds** (single LLM round-trip time).

---

## Current Architecture (What We're Working With)

### Infrastructure

- **Compute:** AWS ECS Fargate (NestJS + Node.js)
- **Database:** AWS RDS PostgreSQL (t4g.micro: ~112 max_connections, t4g.small: ~225)
- **Queue:** PgBoss (PostgreSQL-backed job queue)
- **AWS services already in use:** CloudWatch (metrics), S3 (feedback screenshots)
- **LLM providers:** Anthropic, OpenAI, Google Gemini (via API keys in env)
- **Auth:** Google OAuth2 (Gmail API access tokens stored in DB)

### Key Dependencies Per Batch Job

| Dependency             | How it's used                                            | Lambda implication                |
| ---------------------- | -------------------------------------------------------- | --------------------------------- |
| **PostgreSQL (RDS)**   | Read/write analysis records, user context, batch results | Direct connection or API          |
| **LLM API keys**       | Anthropic/OpenAI/Gemini for `analyzeEmailPatterns()`     | Secrets Manager                   |
| **Gmail OAuth tokens** | Fetch thread content via Gmail API                       | Read from DB or passed in payload |
| **CloudWatch**         | Performance budget metrics                               | Already AWS-native                |

### Current Job Data Flow

```
Orchestrator → PgBoss.send("analyze-context-batch", {
  userId, batchIndex, batch (pre-processed thread payloads),
  sentPayload (only batch 0), userEmail,
  currentContextForPrompt, analysisRecordId,
  totalBatches, after, before
})
```

Each batch payload is **self-contained** — the orchestrator pre-fetches threads in groups of 30, builds payloads of 10, and the batch processor either uses the pre-processed `batch` field or re-fetches via `threadIds`. This is Lambda-friendly.

---

## Proposed Architecture

### High-Level Flow

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  ECS Fargate     │     │   SQS Queue  │     │  Lambda Function │
│  (Orchestrator)  │────▶│  (FIFO, per- │────▶│  (batch-analyzer)│
│                  │     │   user group) │     │                  │
│  1. Fetch threads│     └──────────────┘     │  1. Parse payload│
│  2. Build batches│            │              │  2. Call LLM     │
│  3. Send to SQS  │            │              │  3. Write to RDS │
│  4. Queue final. │     ┌──────────────┐     │  4. Return       │
│     (delayed)    │     │   DLQ        │     └──────────────────┘
└──────────────────┘     └──────────────┘
        │                                              │
        │         ┌──────────────────────┐            │
        └────────▶│  Finalization        │◀───────────┘
                  │  (existing PgBoss)   │  (DB counter check)
                  └──────────────────────┘
```

### Phase 1: New Users Only (MVP)

Only route **new user onboarding** context analysis to SQS + Lambda. Existing users' periodic re-analysis continues through PgBoss.

**Rationale:** New users have the worst UX (waiting 5-15 min staring at a progress bar). Existing users don't notice periodic background re-analysis taking a few extra minutes.

### Phase 2: All Users (Future)

Migrate all `analyze-context-batch` jobs to Lambda. Remove PgBoss batch workers.

---

## Design Decisions

### D1: Lambda → RDS (Direct Connection via RDS Proxy)

**Decision:** Use **RDS Proxy** for Lambda → PostgreSQL connections.

**Rationale:**

- 30 concurrent Lambda invocations each opening a DB connection would exhaust RDS max_connections instantly (t4g.micro has ~112 total, already shared with ECS Fargate web/worker tasks)
- RDS Proxy multiplexes connections, so 30 Lambdas share a small pool
- Alternative (internal API endpoint) adds latency and complexity — each batch does 2-3 DB writes, not worth HTTP overhead
- RDS Proxy cost: ~$0.015/hour (~$11/month) for a small instance

**Connection budget with RDS Proxy:**

- ECS Fargate: 4 tasks × (5 TypeORM + 5 PgBoss) = 40 connections
- RDS Proxy pool for Lambda: 20 connections (proxy multiplexes 30+ Lambdas into 20 actual connections)
- Total: 60 connections → safe for t4g.micro (112 max) with room

### D2: SQS Queue Configuration

**Decision:** Use **SQS Standard Queue** (not FIFO) with per-user message grouping via deduplication.

- Standard queue gives higher throughput and cheaper pricing
- Deduplication via `singletonKey` equivalent: `MessageDeduplicationId = analyze-context-batch-{analysisRecordId}-{batchIndex}`
- No ordering requirement — batches are independent
- **Visibility timeout:** 120s (2× the 60s `BATCH_TIMEOUT_MS`)
- **DLQ:** After 3 failed receives, move to `bearlymail-context-analysis-dlq`
- **Message retention:** 4 hours (analysis should complete well within this)

### D3: Finalization Trigger (DB Counter)

**Decision:** Keep the existing **finalization via PgBoss delayed job + polling** pattern.

**How it works today (unchanged):**

1. Orchestrator queues `finalize-context-analysis` with `startAfter: now + BATCH_TIMEOUT_MS` (60s)
2. Finalization processor checks `checkBatchesComplete(analysisRecordId, totalBatches)` — reads `stats.batchResults` from DB
3. If not all complete, re-queues with exponential delay (up to `MAX_FINALIZATION_RETRIES`)

**Why keep it:**

- Already battle-tested with retry logic, max retry limits, failure marking
- Lambda writes batch results to DB (same as PgBoss workers do now)
- Finalization just checks the DB — doesn't care who wrote the results
- Alternative (Step Functions, SQS completion events) adds AWS complexity for marginal gain

**Enhancement:** Reduce the initial `startAfter` delay from 60s to 30s for Lambda-routed analyses, since 30 parallel batches should finish faster.

### D4: Cold Start Mitigation

**Decision:** Use **Provisioned Concurrency** of 10 + reliance on Lambda's burst scaling.

- Lambda cold start for Node.js: ~500ms-1.5s
- With 30 concurrent invocations, first batch sees ~30 cold starts (but they're parallel, so wall-clock impact is just one cold start: ~1.5s)
- Provisioned concurrency of 10 reduces cold starts to ~20 out of 30 (saves ~$3-5/month)
- **Alternative considered:** Do nothing. 1.5s cold start is negligible compared to 15-30s LLM call. **This may be the pragmatic choice for MVP.**

**MVP recommendation:** Skip provisioned concurrency initially. Cold starts are noise compared to LLM latency.

### D5: LLM Rate Limit Handling

**Decision:** Built-in retry with exponential backoff in the Lambda function + SQS visibility timeout extension.

**Current state:** The batch processor already has 5-retry exponential backoff (`calculateBackoffDelay`). Port this logic into the Lambda handler.

**Additional measures:**

1. **SQS batch size = 1** — each Lambda invocation processes one batch (same as today)
2. **Lambda timeout = 90s** — enough for LLM call + retries
3. **Concurrency limit on Lambda = 30** — prevent runaway scaling if multiple users onboard simultaneously
4. **Per-user serialization not needed** — onboarding is one-time, and the orchestrator already handles the "one analysis at a time" constraint via `singletonKey`

**Rate limit math:**

- Anthropic: 1000 RPM on standard tier → 30 requests is fine
- OpenAI: 500 RPM on tier 1, 5000 RPM on tier 2+ → fine
- Gemini: 360 RPM free tier, 1000 RPM paid → fine for 30 concurrent
- **Risk:** If 10 users onboard simultaneously → 300 concurrent LLM calls. Mitigate via Lambda reserved concurrency cap of 30-50.

### D6: Cost Analysis

#### Current Cost (PgBoss on ECS Fargate)

- ECS Fargate task already running → $0 marginal cost for processing
- Time cost: 5-15 min user wait → **churn risk** for $5/seat product

#### Lambda Cost (30 batches × per user)

| Component          | Calculation                                 | Cost/user                   |
| ------------------ | ------------------------------------------- | --------------------------- |
| Lambda invocations | 30 invocations × $0.0000002                 | $0.000006                   |
| Lambda duration    | 30 × 30s × 512MB = 450 GB-s × $0.0000166667 | $0.0075                     |
| SQS messages       | 30 sends + 30 receives × $0.0000004         | $0.000024                   |
| RDS Proxy          | ~$11/month shared across all users          | ~$0.001/user (at 10K users) |
| **Total per user** |                                             | **~$0.009**                 |

At $5/user/seat pricing:

- 1000 new users/month → $9/month Lambda cost → **0.18% of revenue**
- 10,000 new users/month → $90/month → **0.18% of revenue**

**Verdict:** Negligible cost. The ROI from faster onboarding (reducing churn) vastly outweighs $0.009/user.

### D7: Security

**Decision:** Use AWS Secrets Manager for all sensitive values.

| Secret                                                        | Storage                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_PORT`, `DB_NAME` | Secrets Manager (single secret: `bearlymail/lambda/db`)  |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`       | Secrets Manager (single secret: `bearlymail/lambda/llm`) |
| `LLM_PROVIDER` (default provider selection)                   | Lambda env var (not sensitive)                           |

- Gmail OAuth tokens: **NOT stored in Secrets Manager**. They're user-specific and already in the DB. Lambda reads them from RDS when needed (only for the `threadIds` path where it needs to fetch from Gmail). For MVP, use the **pre-processed batch path** (orchestrator pre-fetches and sends payloads in SQS message), avoiding Gmail API calls from Lambda entirely.
- Lambda VPC: Deploy in same VPC as RDS for private connectivity
- IAM role: Minimal permissions — SQS receive/delete, Secrets Manager read, CloudWatch write, VPC networking

---

## Implementation Plan

### Step 1: AWS Infrastructure (IaC)

Create CDK/CloudFormation stack or Terraform config for:

- [ ] SQS queue: `bearlymail-context-analysis`
- [ ] SQS DLQ: `bearlymail-context-analysis-dlq`
- [ ] Lambda function: `bearlymail-batch-analyzer`
  - Runtime: Node.js 20.x
  - Memory: 512MB
  - Timeout: 90s
  - Reserved concurrency: 30
  - VPC: Same as RDS
  - Trigger: SQS queue (batch size 1)
- [ ] RDS Proxy (if not already created)
- [ ] Secrets Manager secrets
- [ ] IAM roles and policies
- [ ] Security group for Lambda → RDS Proxy access

### Step 2: Lambda Function

Create a standalone Lambda handler that:

- [ ] Reads SQS event, parses batch payload
- [ ] Initializes LLM client (from cached Secrets Manager values)
- [ ] Connects to RDS via Proxy (connection reuse across warm invocations)
- [ ] Runs the same analysis logic as `ContextBatchAnalysisProcessor.runBatchAttempt()`:
  - Parse batch payload (pre-processed threads)
  - Call `analyzeEmailPatterns()` via LLM
  - Write results to `context_analysis.stats.batchResults[batchIndex]`
  - Update `analyzedCount`
  - Emit CloudWatch metrics
- [ ] Handles errors with retry (SQS handles redelivery; Lambda handles LLM-level retry)

**Key architectural choice:** Extract the core analysis logic from `ContextBatchAnalysisProcessor` into a **shared module** (`context-batch-analysis.core.ts`) that both the PgBoss processor and Lambda handler can import. This avoids code duplication.

### Step 3: Orchestrator Changes

Modify `ContextAnalysisOrchestratorService`:

- [ ] Add `isNewUserOnboarding` flag (passed from `OnboardingService`)
- [ ] When `isNewUserOnboarding && SQS_ENABLED`:
  - Send batches to SQS instead of PgBoss
  - Use AWS SDK `SQS.sendMessageBatch()` for efficiency (up to 10 messages per batch API call)
  - Reduce finalization `startAfter` delay to 30s
- [ ] Keep PgBoss path for non-onboarding analysis (feature flag: `LAMBDA_CONTEXT_ANALYSIS_ENABLED`)

### Step 4: Finalization Adjustments

- [ ] Reduce `startAfter` for Lambda-routed analyses (30s vs 60s)
- [ ] Add CloudWatch alarm on DLQ depth > 0 (alert if batches are failing)
- [ ] No other finalization changes needed — it already polls DB for completion

### Step 5: Feature Flag & Rollout

- [ ] Env var: `LAMBDA_CONTEXT_ANALYSIS_ENABLED=true|false` (default: false)
- [ ] Gradual rollout: enable for 10% of new users → 50% → 100%
- [ ] Monitoring: CloudWatch dashboard for Lambda duration, errors, DLQ depth, LLM latency
- [ ] Rollback: Set `LAMBDA_CONTEXT_ANALYSIS_ENABLED=false` → immediate fallback to PgBoss

---

## Files to Create/Modify

### New Files

| File                                                | Purpose                                          |
| --------------------------------------------------- | ------------------------------------------------ |
| `infra/sqs-lambda-context-analysis.ts`              | CDK/Terraform IaC for SQS + Lambda + RDS Proxy   |
| `lambda/batch-analyzer/handler.ts`                  | Lambda entry point                               |
| `lambda/batch-analyzer/db.ts`                       | RDS Proxy connection setup                       |
| `lambda/batch-analyzer/secrets.ts`                  | Secrets Manager client                           |
| `lambda/batch-analyzer/package.json`                | Lambda-specific dependencies                     |
| `server/src/context/context-batch-analysis.core.ts` | Shared analysis logic (extracted from processor) |
| `server/src/aws/sqs.service.ts`                     | SQS client service for orchestrator              |

### Modified Files

| File                                                          | Change                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `server/src/context/context-analysis-orchestrator.service.ts` | Add SQS send path alongside PgBoss                   |
| `server/src/context/context-batch-analysis.processor.ts`      | Import shared core logic instead of inline           |
| `server/src/context/context-finalization.processor.ts`        | Shorter delay for Lambda-routed analyses             |
| `server/src/aws/aws.module.ts`                                | Export SQS service                                   |
| `server/src/config/env.validation.ts`                         | Add `LAMBDA_CONTEXT_ANALYSIS_ENABLED`, SQS queue URL |
| `server/src/onboarding/onboarding.service.ts`                 | Pass `isNewUserOnboarding` flag to orchestrator      |

---

## Risks & Mitigations

| Risk                                   | Impact                        | Mitigation                                                                                                          |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| RDS connection exhaustion from Lambda  | DB outage                     | RDS Proxy (D1) + reserved concurrency cap (30)                                                                      |
| LLM rate limits with concurrent users  | Failed analyses               | Lambda concurrency cap + built-in retry + DLQ                                                                       |
| Lambda cold starts                     | Slightly slower first batch   | Negligible vs LLM latency; provision concurrency later if needed                                                    |
| SQS message size limit (256KB)         | Large batch payloads rejected | Pre-processed batch payloads are ~10-50KB each (10 threads × ~2-5KB preview). Safe. Monitor and compress if needed. |
| Divergent codepaths (PgBoss vs Lambda) | Bugs in one path not caught   | Shared core module + same test suite + feature flag for gradual rollout                                             |
| RDS Proxy cost ($11/month)             | Fixed overhead                | Justified by onboarding speed improvement. Can be shared with other Lambda use cases.                               |

---

## Success Metrics

1. **Onboarding analysis time:** 5-15 min → <90 seconds (P95)
2. **Onboarding completion rate:** Track in PostHog — expect improvement from faster experience
3. **Error rate:** Lambda batch failure rate < 2% (matching current PgBoss rate)
4. **Cost:** < $0.01 per new user onboarding (Lambda + SQS)
5. **No regression:** Existing users' periodic analysis unaffected

---

## Open Questions for Jeremy

1. **IaC tool preference?** CDK (TypeScript, matches codebase) vs Terraform vs CloudFormation YAML?
2. **RDS instance size?** If still on t4g.micro (112 max_connections), consider upgrading to t4g.small (225) when adding RDS Proxy + Lambda connections.
3. **Existing RDS Proxy?** Is one already provisioned for the RDS instance, or do we need to create one?
4. **Lambda deployment pipeline?** Separate from ECS Fargate deploy? CI/CD via GitHub Actions?
5. **Prioritisation processing too?** The `refine-priority` / `refine-priority-batch` jobs (LLM-based priority scoring) have the same sequential bottleneck. Should we plan Lambda for those too in Phase 2?

---

## Implementation Progress (Captain Codebeard)

### Completed

- [x] **`server/src/aws/sqs.service.ts`** — SQS client service with `sendMessage` + `sendMessageBatch`
- [x] **`server/src/aws/aws.module.ts`** — Updated to export `SqsService`
- [x] **`server/src/config/env.validation.ts`** — Added `LAMBDA_CONTEXT_ANALYSIS_ENABLED` + `CONTEXT_ANALYSIS_SQS_QUEUE_URL`
- [x] **`server/src/context/context-batch-analysis.core.ts`** — Shared payload types + `buildBatchDeduplicationId()`
- [x] **`server/src/context/context-analysis-orchestrator.service.ts`** — SQS dispatch path alongside PgBoss; shorter finalization delay (30s) for Lambda-routed analyses
- [x] **`lambda/batch-analyzer/`** — Standalone Lambda handler:
  - `src/handler.ts` — SQS event handler with retry + CloudWatch metrics
  - `src/llm.ts` — Direct LLM client (Anthropic/OpenAI/Gemini) with prompt bundling
  - `src/db.ts` — RDS Proxy connection + `saveBatchResult()` + `saveBatchFailure()`
  - `src/secrets.ts` — AWS Secrets Manager client with in-memory cache
  - `src/types.ts` — Shared payload types
  - `package.json`, `tsconfig.json` — Build config
- [x] **`infrastructure/lib/bearlymail-context-analysis-stack.ts`** — CDK stack for SQS queue + DLQ + Lambda + RDS Proxy + IAM roles + CloudWatch alarms

### Still TODO

- [ ] Bundle `lambda/batch-analyzer/prompts/analyze-email-patterns.md` in Lambda deployment package
- [ ] Update `server/src/onboarding/onboarding.service.ts` to pass `isNewUserOnboarding: true` flag
- [ ] Update `infrastructure/bin/` to instantiate `BearlyMailContextAnalysisStack`
- [ ] Add `@aws-sdk/client-sqs` to `server/package.json` dependencies
- [ ] Configure CDK bootstrap + Lambda deployment pipeline in GitHub Actions
- [ ] Populate Secrets Manager secrets with actual API keys (post-deploy)
- [ ] Update the `lambdaDbSecret` host with actual RDS Proxy endpoint after first deploy
