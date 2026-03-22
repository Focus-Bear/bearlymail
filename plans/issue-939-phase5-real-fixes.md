# Phase 5 — Fix Underlying ESLint Violations (Zero Overrides, Zero Disables)

**Issue:** #939
**Goal:** Remove ALL file-level overrides for production code from `server/.eslintrc.js` and `client/.eslintrc.js`, and remove ALL `eslint-disable` comments from production code, by fixing the underlying violations at the source.

**Jeremy's direction:** "I don't want file level overrides. I want the issues fixed. The end goal is 0 overrides and 0 eslint disables."

---

## Table of Contents

1. [Config-Level Fix: `react/no-danger` Rule](#1-config-level-fix-reactno-danger-rule)
2. [Server: `context-batch-analysis.processor.ts` (756 lines)](#2-server-context-batch-analysisprocessorts)
3. [Server: `priority-analysis.service.ts` (655 lines)](#3-server-priority-analysisservicets)
4. [Server: `emails.service.ts` (645 lines)](#4-server-emailsservicets)
5. [Server: `github-api.service.ts` (955 lines)](#5-server-github-apiservicets)
6. [Server: `llm.service.ts` (3176 lines)](#6-server-llmservicets)
7. [Server: `llm-processor.ts` (1972 lines)](#7-server-llm-processorts)
8. [Server: `gmail.provider.ts` (1378 lines)](#8-server-gmailproviderts)
9. [Server: `context.service.ts` (3758 lines)](#9-server-contextservicets)
10. [Server: `context-gmail-data.service.ts` (1295 lines)](#10-server-context-gmail-dataservicets)
11. [Client: `SanitizedHTML.tsx` Inline Disable](#11-client-sanitizedhtmltsx-inline-disable)
12. [Client: Large Hooks Overrides](#12-client-large-hooks-overrides)
13. [Client: Large Components Overrides](#13-client-large-components-overrides)
14. [Client: `emailBodyUtils.ts` Override](#14-client-emailbodyutilsts-override)
15. [Override Removal Checklist](#15-override-removal-checklist)

---

## 1. Config-Level Fix: `react/no-danger` Rule

**Current state:** `SanitizedHTML.tsx` has an inline `// eslint-disable-next-line react/no-danger`. This is the ONLY place in the codebase that uses `dangerouslySetInnerHTML`, and it's wrapped with DOMPurify.

**Recommendation: Remove the `react/no-danger` rule from the ESLint config entirely (or at the project level).**

**Rationale:**
- The project's architecture explicitly channels ALL HTML rendering through `SanitizedHTML.tsx` with DOMPurify
- The `react/no-danger` rule's purpose is to flag unsafe HTML injection — but the project has already solved this architecturally
- Keeping the rule means the one legitimate, auditable, safe use needs a permanent disable comment
- The rule adds no safety value when DOMPurify is always used

**Action:**
- Add `'react/no-danger': 'off'` to `client/.eslintrc.js` rules section
- Add a comment: `// Disabled: all HTML rendering goes through SanitizedHTML.tsx with DOMPurify. See issue #939.`
- Remove the `// eslint-disable-next-line react/no-danger` comment from `SanitizedHTML.tsx`

**Alternative (if Jeremy prefers to keep the rule active):**
The only other option is to rewrite `SanitizedHTML.tsx` to NOT use `dangerouslySetInnerHTML` — e.g., parse the sanitized HTML into React elements using a library like `html-react-parser`. This would eliminate the lint violation but adds a dependency and complexity for no security benefit.

**⚠️ Decision needed from Jeremy:** Disable the rule project-wide, or rewrite with `html-react-parser`?

---

## 2. Server: `context-batch-analysis.processor.ts` (756 lines)

**Current violations:** `max-lines-per-function` (handleBatchAnalysisJob ~600 lines), `complexity`, `max-statements`

**The `handleBatchAnalysisJob` method does 4 distinct phases in one enormous function:**
1. Fetch threads by ID (lines ~250–310) — fetches thread data from Gmail
2. Process threads into analysis payloads (lines ~310–400) — maps raw threads to batch payloads
3. Call LLM for analysis (lines ~440–490) — fires LLM call and records metrics
4. Save results to database (lines ~500–600) — persists batch results and updates progress

Plus retry loop wrapping, error handling, and CloudWatch metric emission throughout.

### Refactoring Instructions

**Extract 4 private methods + 1 helper:**

1. **`fetchAndProcessThreads(workerId, userId, threadIds, userEmail, legacyBatch)`** → returns `{ batch, fetchDuration, processDuration }`
   - Contains the `if (threadIds)` branch that fetches from `gmailDataService.fetchThreadsByIds` and maps to payloads
   - Contains the `else if (legacyBatch)` branch
   - Includes the CloudWatch metrics for `BATCH_FETCH_THREADS` and `BATCH_PROCESS_THREADS`
   - Extract lines ~237–430

2. **`runLlmAnalysis(workerId, userId, batch, sentPayload, userEmail, currentContextForPrompt)`** → returns `{ batchAnalysis, llmDuration }`
   - The LLM call + CloudWatch `BATCH_LLM_ANALYSIS` metric
   - Extract lines ~440–490

3. **`saveBatchResults(workerId, userId, batchIndex, analysisRecordId, totalBatches, batch, batchAnalysis)`** → returns `{ saveDuration }`
   - Database read, merge, save logic + CloudWatch `BATCH_SAVE_RESULTS` metric
   - Extract lines ~500–590

4. **`emitTotalBudgetMetric(workerId, userId, fetchDuration, processDuration, llmDuration, saveDuration)`** → void
   - The `BATCH_TOTAL` CloudWatch metric emission
   - Extract lines ~600–630

5. **`updateUserProgress(workerId, userId, batchResults, totalBatches)`** → void
   - Progress calculation + `usersService.update` call
   - Extract lines ~640–660

**After extraction, `handleBatchAnalysisJob` becomes a ~80-line orchestrator:**
```
- Destructure job data
- Initialize tracker
- Log receipt
- while (attemptNumber <= maxRetries):
  - retry backoff
  - { batch, fetchDuration, processDuration } = await fetchAndProcessThreads(...)
  - { batchAnalysis, llmDuration } = await runLlmAnalysis(...)
  - { saveDuration } = await saveBatchResults(...)
  - emitTotalBudgetMetric(...)
  - await updateUserProgress(...)
  - tracker.finish(); return;
  - catch: retry logic or store failure
```

**Also extract the thread-to-payload mapping (lines ~310–400) into a standalone pure function:**
6. **`mapThreadToAnalysisPayload(thread, userEmail)`** → the batch item type or null
   - The `.map()` callback that computes quickestReply, userReplied, etc.
   - This is a pure function — can be unit tested independently

**File stays under 800 lines after these changes (no file split needed).**

---

## 3. Server: `priority-analysis.service.ts` (655 lines)

**Current violations:** `max-lines-per-function` (analyzePriority ~225 lines, analyzePriorityBatch ~295 lines), `complexity`, `max-statements`

### `analyzePriority` Refactoring

**Extract 3 methods:**

1. **`buildPriorityPrompt(email, userHistory, userContext, threadInfo)`** → returns rendered prompt string
   - Contains: cleanEmailContent call, getPrompt lookup, date formatting, buildUserContextTexts call, threadInfoText construction, renderPrompt call
   - Extract lines ~150–220

2. **`parsePriorityResponse(response, preComputedSentimentScore, userId)`** → returns the result object or null
   - Contains: JSON extraction, field normalization (Math.max/min clamping), protoCategorySuggestion extraction
   - Extract lines ~230–290

3. **`buildFallbackPriorityResult(response, preComputedSentimentScore)`** → returns fallback result object
   - Contains: urgencyKeywords regex check, fallback scores
   - Extract lines ~300–325

**After extraction, `analyzePriority` becomes ~40 lines:** build prompt → call LLM → parse response → fallback if needed.

### `analyzePriorityBatch` Refactoring

**Extract 2 methods:**

1. **`buildBatchPriorityPrompt(emails, userContext)`** → returns rendered batch prompt string
   - Contains: emailDescriptions mapping, getPrompt lookup, buildUserContextTexts, renderPrompt
   - Extract lines ~440–510

2. **`parseBatchPriorityResponse(response, emails, userId)`** → returns Map of results
   - Contains: JSON parsing (with fallbacks), extractBatchResultsArray call, sentiment lookup, result mapping
   - Extract lines ~520–600

3. **`fillFallbackEntries(results, emails)`** → mutates results map with sentinel entries
   - Contains: the missing-key loop and logging
   - Extract lines ~610–645

**After extraction, `analyzePriorityBatch` becomes ~30 lines.**

---

## 4. Server: `emails.service.ts` (645 lines)

**Current violations:** `max-params` (constructor has 15 parameters, limit is 13)

**The constructor has 15 injected services.** However, looking at the actual methods, `emails.service.ts` is a **facade** — almost every method is a one-line delegation:
```ts
async queueBatchPriorityRefinement(...) { return this.emailLifecycleService.queueBatchPriorityRefinement(...); }
```

### Refactoring Instructions

**Option A (preferred): Group related services into a config/services object.**

Create `EmailServiceDependencies` interface:
```ts
interface EmailServiceDependencies {
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  emailProviderManager: EmailProviderManager;
  threadService: EmailThreadService;
  searchService: EmailSearchService;
  starService: EmailStarService;
  debugService: EmailDebugService;
  readService: EmailReadService;
  crudService: EmailCrudService;
  gmailService: EmailGmailService;
  statusService: EmailStatusService;
  inboxService: EmailInboxService;
  priorityExplanationService: EmailPriorityExplanationService;
  lifecycleService: EmailLifecycleService;
  archiveService: EmailArchiveService;
}
```

Use NestJS `@Inject()` with a custom provider token to inject the grouped dependencies as a single object. Constructor becomes: `constructor(@Inject(EMAIL_DEPS) private deps: EmailServiceDependencies)`.

Register a factory provider in the module:
```ts
{
  provide: EMAIL_DEPS,
  useFactory: (repo, threadRepo, ...) => ({ emailRepository: repo, ... }),
  inject: [getRepositoryToken(Email), getRepositoryToken(EmailThread), ...],
}
```

**Option B (simpler): Raise `max-params` to 15 for NestJS DI constructors.**
The current limit is 13. Since this is a NestJS facade pattern where DI constructors legitimately need many injected services, raising to 15 is defensible. However, Jeremy wants 0 overrides, so Option A is preferred.

**Option C: Eliminate the facade entirely.** Since every method delegates to a sub-service, callers could inject those sub-services directly. This is a larger refactor but removes the file entirely. Assess call sites first.

**⚠️ Decision needed from Jeremy:** Option A (group into object), B (raise limit), or C (remove facade)?

---

## 5. Server: `github-api.service.ts` (955 lines)

**Current violations:** `max-lines` (955 > 800 limit)

**The file has clear domain boundaries:**
- Issue operations: `fetchIssueStatus`, `fetchIssueProjects`, `createIssue`, `updateIssueStatus`, `addIssueComment`, `searchIssues` + helpers
- PR operations: `fetchPRStatus`, `fetchPRApiData`, `determineReviewStatus`, `logPR404Context`
- Project operations: `fetchProjectStatusOptions`, `executeProjectItemsQuery`, `extractStatusFromFieldValues`, `extractProjectsFromNodes` + GraphQL queries
- Multi-status: `fetchMultipleStatuses`

### Refactoring Instructions

**Split into 3 files:**

1. **`github-issue.service.ts`** (~350 lines)
   - Move: `fetchIssueStatus`, `fetchIssueProjects`, `createIssue`, `updateIssueStatus`, `addIssueComment`, `searchIssues`
   - Move: `fetchMultipleStatuses` (orchestrates issues + PRs — keep here, inject PR service)
   - Inject: `GitHubPRService`, `GitHubProjectService`

2. **`github-pr.service.ts`** (~200 lines)
   - Move: `fetchPRStatus`, `fetchPRApiData`, `determineReviewStatus`, `logPR404Context`

3. **`github-project.service.ts`** (~250 lines)
   - Move: `projectItemsQuery`, `projectStatusOptionsQuery` (GraphQL constants)
   - Move: `executeProjectItemsQuery`, `extractStatusFromFieldValues`, `extractProjectsFromNodes`, `fetchProjectStatusOptions`

4. **`github-api.service.ts`** (~150 lines) — re-export facade
   - Keep: `createClient`, `testToken`, `testRepoAccess`, `checkRepositoryAccess`
   - Re-export or delegate to the 3 sub-services for backward compatibility
   - Alternatively, update callers to inject sub-services directly (cleaner)

---

## 6. Server: `llm.service.ts` (3176 lines)

**Current violations:** `max-lines` (3176 >> 800 limit), `max-lines-per-function` on multiple methods

**This is the largest file in the codebase. It's a God class containing every LLM operation.**

### Refactoring Instructions

**Split into domain-specific LLM service files (each under 800 lines):**

1. **`llm-summary.service.ts`** (~500 lines)
   - Move: `summarizeEmail` (line 423), `summarizeEmailWithPhishingCheck` (line 501), `summarizeSingleThread` (line 798), `summarizeThreadsFallback` (line 846), `summarizeThreads` (line 918), `summarizeCustomPromptWithPhishing` (line 705)
   - Inject: `LLMCoreService`

2. **`llm-tone.service.ts`** (~350 lines)
   - Move: `checkTone` (line 999), `disputeToneCheck` (line 2359)
   - Inject: `LLMCoreService`

3. **`llm-actions.service.ts`** (~350 lines)
   - Move: `extractActionItems` (line 1058), `detectSuggestedActions` (line 1240)
   - Inject: `LLMCoreService`

4. **`llm-reply.service.ts`** (~500 lines)
   - Move: `generateReplyOptions` (line 1321), `generateReplyDraft` (line 1448), `generateMeetingReply` (line 1520), `generateFollowUpDraft` (line 1583)
   - Inject: `LLMCoreService`

5. **`llm-analysis.service.ts`** (~500 lines)
   - Move: `analyzeEmailPatterns` (line 290), `analyzeOverrideReason` (line 1663)
   - Inject: `LLMCoreService`

6. **`llm-search.service.ts`** (~400 lines)
   - Move: `generateSearchRelevanceExplanation` (line 1897), `generateExplanationChunk` (line 2069), `generateSearchRelevanceExplanationsBatch` (line 2169)
   - Inject: `LLMCoreService`

7. **`llm-category.service.ts`** (~500 lines)
   - Move: `consolidateEmailCategories` (line 2650), `generateCategoriesFromOther` (line 2825), `identifyCustomLabels` (line 3005)
   - Inject: `LLMCoreService`

8. **`llm-utility.service.ts`** (~300 lines)
   - Move: `extractQAndA` (line 1792), `redactNamesWithLLM` (line 2246), `validateWritingExample` (line 2290), `compressUserContext` (line 3065)
   - Move: `extractPlainSummary` (line 79, standalone function) and `generateText` (line 136, if it's just a pass-through)
   - Inject: `LLMCoreService`

9. **`llm.service.ts`** (~100 lines) — re-export facade
   - Inject all 8 sub-services
   - Delegate each method to the appropriate sub-service for backward compatibility
   - Callers can be incrementally updated to inject sub-services directly

**Within the split, functions that still exceed 100 lines need internal extraction:**

- **`summarizeEmailWithPhishingCheck` (~204 lines):** Extract `buildPhishingCheckPrompt(email, customPrompt)` and `parsePhishingResponse(response)` as private methods
- **`extractActionItems` (~182 lines):** Extract `parseActionItemsResponse(response)` and `buildActionItemsPrompt(email, customRules)`
- **`generateSearchRelevanceExplanation` (~172 lines):** Extract `buildRelevancePrompt(email, query)` and `parseRelevanceResponse(response)`
- **`disputeToneCheck` (~291 lines):** Extract `buildDisputePrompt(email, originalResult, userArgument)`, `parseDisputeResponse(response)`, and `buildDisputeFallback(originalResult)`
- **`consolidateEmailCategories` (~175 lines):** Extract `buildConsolidationPrompt(categories)` and `parseConsolidationResponse(response)`
- **`generateCategoriesFromOther` (~180 lines):** Extract `buildCategoryGenerationPrompt(emails)` and `parseCategoryResponse(response)`
- **`generateText` (~154 lines):** Extract streaming logic into `handleStreamingResponse(response, options)` if applicable

---

## 7. Server: `llm-processor.ts` (1972 lines)

**Current violations:** `max-lines` (1972 >> 800), `max-lines-per-function`, `complexity`

### Refactoring Instructions

**Split into 3 focused processor files:**

1. **`llm-summary-processor.ts`** (~600 lines)
   - Move: `processSummaryJobBatch` (line 806), `collectSummaryJobsToProcess` (line 866), `fetchSummarizationRulesForJobs` (line 938), `fireSummaryLlmCalls` (line 961), `saveSummaryResults` (line 1023)
   - Move: `getThreadSummary` (line 1850), `updateSummaryIncrementally` (line 1867)

2. **`llm-priority-processor.ts`** (~700 lines)
   - Move: `handleRefinePriorityJob` (line 214), `handleRefinePriorityBatchJob` (line 368)
   - Move: `shouldSkipPriorityRecalculation` (line 652), `checkHasNewEmails` (line 734)
   - Move: `applyPriorityResult` (line 1159), `resolveCategoryAndProtoCategory` (line 1490), `applyProtoSuggestion` (line 1597), `tryIncrementalAnalysis` (line 1716)

3. **`llm-processor.ts`** (~200 lines) — orchestrator
   - Keep: `onModuleInit` (PgBoss job registration)
   - Keep: Constructor and shared dependencies
   - Delegate to `LLMSummaryProcessor` and `LLMPriorityProcessor`

**Within the split, oversized functions need internal extraction:**

- **`handleRefinePriorityJob` (~154 lines):** Extract `fetchEmailForPriority(emailId)` → returns email or null, and `buildPriorityContext(user, emailThread)` → returns userContext + threadInfo
- **`handleRefinePriorityBatchJob` (~280 lines):** Extract `prepareEmailBatch(jobs)` → returns enriched email array, and `applyBatchResults(results, emailMap)` → applies each result
- **`applyPriorityResult` (~330 lines):** Extract `persistPriorityScores(email, result)`, `updateThreadCategory(thread, category)`, `handleCategoryOverride(email, category, overrideResult)`
- **`saveSummaryResults` (~135 lines):** Extract `persistSummaryToEmail(email, summaryResult)` and `handlePhishingDetection(email, phishingResult)`

---

## 8. Server: `gmail.provider.ts` (1378 lines)

**Current violations:** `max-lines` (1378 >> 800)

### Refactoring Instructions

**Split into 3 files:**

1. **`gmail-sync.service.ts`** (~500 lines)
   - Move: `syncEmails` (line 201), `fetchAllThreadsWithPagination` (line 395), `fetchGmailThreadIds` (line 509), `performSync` (line 570), `processThreadBatches` (line 654), `processMessage` (line 737), `applyThreadUpdates` (line 771), `checkExistingStarredThreads` (line 790), `syncThreadArchivedStatus` (line 821), `handleSyncError` (line 864)

2. **`gmail-scan.service.ts`** (~300 lines)
   - Move: `scanHistory` (line 953), `processScanEmail` (line 1012), `updateScanProgress` (line 1055), `verifyInboxStatus` (line 902)

3. **`gmail.provider.ts`** (~400 lines) — core provider
   - Keep: `createGmailClient`, `getGmailLabels`, `convertLabelIdsToNames`, `isConnected`, `getAccountInfo`, `handleMissingRefreshToken`, `validateToken`, `handleTokenValidationError`
   - Keep: `sendReply`, `sendEmail`, `searchEmails`, `getStarredInboxThreadIds`, `getInboxThreadIds`
   - Inject: `GmailSyncService`, `GmailScanService`

---

## 9. Server: `context.service.ts` (3758 lines)

**Current violations:** `max-lines` (3758 >> 800), `max-lines-per-function` (multiple functions 250–1150 lines), `complexity`, `max-statements`

**This is the second-largest file. Contains massive functions:**
- `getAnalysisProgress` ~486 lines
- `analyzeAndLearnFromEmails` ~1068 lines
- `checkAndSyncJobs` ~248 lines
- `checkBatchesComplete` ~299 lines
- `finalizeContextAnalysis` ~1150 lines

### Refactoring Instructions

**Split into 5 files:**

1. **`context-analysis-orchestrator.service.ts`** (~600 lines)
   - Move: `analyzeAndLearnFromEmails` — but this 1068-line function must be decomposed first:
     - **`validateAndPrepareAnalysis(userId)`** → checks user, creates analysis record, returns config
     - **`fetchEmailDataForAnalysis(userId, userEmail, analysisRecord)`** → fetches threads + sent emails via gmailDataService
     - **`prepareBatchJobs(threads, sentPayload, analysisRecord)`** → splits into batches, returns job descriptors
     - **`dispatchBatchJobs(jobs, analysisRecord)`** → enqueues PgBoss jobs
     - **`extractQAndAFromSentEmails(userId, sentEmails, analysisRecord)`** → the Q&A extraction phase
   - After extraction, `analyzeAndLearnFromEmails` becomes ~60-line orchestrator calling these 5 methods

2. **`context-progress.service.ts`** (~600 lines)
   - Move: `getAnalysisProgress` — decompose this 486-line function:
     - **`fetchAnalysisRecord(userId)`** → DB query + basic validation
     - **`computeBatchProgress(analysisRecord)`** → calculate completed/failed/pending batches
     - **`buildProgressResponse(analysisRecord, batchProgress)`** → assemble the response DTO
   - Move: `getAnalysisRecordById`, `getCompletedBatchCount`

3. **`context-batch-sync.service.ts`** (~600 lines)
   - Move: `checkAndSyncJobs` — decompose:
     - **`fetchPendingBatchJobs(analysisId)`** → query PgBoss for job statuses
     - **`reconcileBatchStatuses(analysisRecord, jobStatuses)`** → update stats based on actual job states
   - Move: `checkBatchesComplete` — decompose:
     - **`evaluateBatchCompletion(analysisRecord)`** → check all batches done/failed
     - **`handleAllBatchesComplete(analysisRecord)`** → transition to finalization

4. **`context-finalization.service.ts`** (~800 lines)
   - Move: `finalizeContextAnalysis` — this 1150-line function is the most critical to decompose:
     - **`mergeBatchContextResults(batchResults)`** → combine context arrays from all batches
     - **`deduplicateAndRankContextItems(mergedItems, existingContext)`** → remove duplicates, rank by confidence
     - **`mergeWritingStyles(batchResults)`** → combine writing style data from batches
     - **`persistFinalContext(userId, contextItems, writingStyle)`** → save to DB
     - **`generateFinalCategories(userId, contextItems)`** → category consolidation
     - **`cleanupAnalysisRecord(analysisRecord)`** → mark complete, clean temp data
     - **`notifyAnalysisComplete(userId, analysisRecord)`** → send progress update
   - After extraction, `finalizeContextAnalysis` becomes ~80-line orchestrator

5. **`context.service.ts`** (~400 lines) — slim facade
   - Keep: `getUserContext`, `createOrUpdateContext`, `updateContext`, `deleteContext`, `deduplicateExistingContext`
   - Keep: `consolidateExistingCategories`, `generateCategoriesFromOther`, `enqueueContextCompressionIfNeeded`, `compressUserContext`
   - Inject and delegate to the 4 new services

---

## 10. Server: `context-gmail-data.service.ts` (1295 lines)

**Current violations:** `max-lines` (1295 >> 800)

### Refactoring Instructions

**Split into 2 files:**

1. **`context-gmail-data.service.ts`** (~600 lines) — inbound email data
   - Keep: `fetchThreadsFromProvider`, `getThreadIdsFromGmail`, `fetchThreadsByIds`, `fetchThreadsFromGmail`, `fetchGmailThreads`, `fetchThread` (the per-thread fetcher)
   - Keep: `getProviderForUser`

2. **`context-gmail-sent-data.service.ts`** (~500 lines) — sent email data
   - Move: `getSentThreadIds`, `fetchSentThreadsFromProvider`, `fetchSentThreadsFromGmail`, `fetchGmailSentThreads`, `fetchSentThread`
   - These are the outbound/sent email fetching methods that parallel the inbound ones

---

## 11. Client: `SanitizedHTML.tsx` Inline Disable

**Current state:** `// eslint-disable-next-line react/no-danger`

**Fix:** Covered by Section 1 above. Disable the rule at config level → remove the inline comment.

---

## 12. Client: Large Hooks Overrides

The following hooks have file-level overrides for `max-lines-per-function`, `max-statements`, `complexity`, and `react-hooks/exhaustive-deps`:

### `useEmailDetailOperations.ts` (1070 lines — over 800-line limit!)

**This hook is a God hook.** It contains ~30 useCallback functions covering: summarization, email fetching, thread navigation, action items, notes, custom rules, reply sending, tone disputes, star management, sender blocking, and calendar invitations.

**Split into 5 focused hooks:**

1. **`useEmailSummarization.ts`** (~150 lines)
   - Move: `handleSummarize`, `handleUseCustomRule`, `fetchCustomRules`, `summaryAbortControllerRef`, `summaryRef`

2. **`useEmailFetching.ts`** (~200 lines)
   - Move: `fetchEmail`, `fetchThreadEmails`, `fetchNote`, `fetchActionItems`, `fetchGithubInfo`, `refreshGithubInfo`, `fetchSuggestedActions`
   - Move: related refs (`previousIdRef`, `emailRef`, `githubFetchedRef`)

3. **`useEmailActions.ts`** (~250 lines)
   - Move: `handleExtractActions`, `handleAddActionItem`, `handleToggleActionItem`, `handleDeleteActionItem`, `handleRegenerateActionItems`, `handleSaveNote`, `handleCreateCustomRule`, `handleActionSelected`, `handleActionSuccess`

4. **`useEmailReply.ts`** (~250 lines)
   - Move: `handleSendReply` (this is the largest single callback), `disputeToneCheck`, `cancelAutoSend`

5. **`useEmailMisc.ts`** (~150 lines)
   - Move: `handleSetStarCount`, `handleBlockSender`, `handleRespondToInvitation`, `getInboxPath`, `triggerAnimation`, `toggleThreadItem`, `handleFetchPriorityExplanation`

6. **`useEmailDetailOperations.ts`** (~100 lines) — composing hook
   - Calls all 5 sub-hooks, merges and returns the combined interface
   - Contains shared state/refs that sub-hooks need (pass as params or use a shared context)

### `useEmailDetailState.ts` (223 lines)

**Over 100-line function limit but under 800 file limit.** Extract state initialization into sub-hooks:

1. **`useEmailThreadState()`** — thread-related state (expanded threads, thread emails)
2. **`useEmailUIState()`** — UI state (loading, animation, modals)

Hook body becomes composition of these + the existing useSelector calls.

### `useInboxState.ts` (445 lines)

**Split into 2 hooks:**

1. **`useInboxFilters.ts`** (~150 lines)
   - Move: filter-related state and callbacks (category filter, search filter, sort order)

2. **`useInboxData.ts`** (~200 lines)
   - Move: data fetching, pagination, email list management

3. **`useInboxState.ts`** (~100 lines) — composing hook

### `useAnalysisProgress.ts` (436 lines)

**Split into 2 hooks:**

1. **`useAnalysisPolling.ts`** (~200 lines)
   - Move: polling logic, interval management, progress tracking

2. **`useAnalysisActions.ts`** (~150 lines)
   - Move: start/stop/retry analysis callbacks

3. **`useAnalysisProgress.ts`** (~100 lines) — composing hook

### Remaining hooks (under 200 lines each)

- **`useContextManagement.ts`** (138 lines) — may be within limits after extracting any useCallbacks that have complex deps. Review and fix `exhaustive-deps` warnings directly.
- **`useRecategorizeProgress.ts`** (195 lines) — similar, review exhaustive-deps.
- **`useSummarizationRules.ts`** (152 lines) — similar.
- **`useInboxKeyboardNavigation.ts`** (116 lines) — just over the 100-line function limit. Extract the keydown handler logic into a separate `handleKeyboardShortcut(event, context)` pure function.

### `react-hooks/exhaustive-deps` Fixes

The overrides currently disable `react-hooks/exhaustive-deps` for the large hooks. After splitting:

**For each `useCallback`/`useEffect` with missing deps:**
1. If adding the dep causes infinite re-renders → wrap the dep in `useRef` (for values that don't need to trigger re-renders) or `useMemo` (for derived values)
2. If the dep is a dispatch function → it's stable, add it (React guarantees dispatch stability)
3. If the dep is a function from props → wrap in `useCallback` at the call site or accept it as a ref
4. Document any intentional omissions with a `// deps: intentionally excluded because [specific reason]` comment (NOT an eslint-disable)

**⚠️ Each sub-hook should pass ESLint's `exhaustive-deps` rule without any disable comments after the split.**

---

## 13. Client: Large Components Overrides

The following components have file-level overrides. **Most are under 500 lines** — they don't violate `max-lines` (800) but exceed `max-lines-per-function` (100) or `complexity` (20).

### Strategy: Extract JSX sections and event handlers

For each component, the pattern is the same:
1. **Extract complex event handlers** into custom hooks (e.g., `useEmailDetailActionsHandlers()`)
2. **Extract JSX sections** into child components (e.g., `<ActionButtonGroup />`, `<ReplyControls />`)
3. **Extract conditional rendering logic** into helper functions

### Specific instructions per component:

**`EmailDetailActions.tsx` (428 lines)**
- Extract: `useEmailActionHandlers()` hook for the action callbacks
- Extract: `<ActionButtonRow />` for the button group JSX
- Extract: `<ArchiveButton />`, `<StarButton />`, `<MoreActionsMenu />` as sub-components
- Target: main component under 100 lines of JSX

**`DealFormModal.tsx` (685 lines)** — most urgent, nearly at file limit
- Extract: `useDealFormState()` hook for form state management
- Extract: `useDealFormValidation()` hook for validation logic
- Extract: `<DealFormFields />` component for the form fields JSX
- Extract: `<DealPipelineSelector />`, `<DealContactSearch />` as sub-components
- Target: modal under 150 lines

**`SearchResults.tsx` (385 lines)**
- Extract: `<SearchResultItem />` component
- Extract: `<SearchResultsHeader />` with filter controls
- Extract: `useSearchResultsData()` hook

**`SchedulingPreferencesSection.tsx` (386 lines)**
- Extract: `<ScheduleTimeSlot />`, `<ScheduleDaySelector />` sub-components
- Extract: `useSchedulingPreferences()` hook for state/handlers

**`GitHubConnectionStatusSection.tsx` (366 lines)**
- Extract: `<GitHubTokenStatus />`, `<GitHubRepoList />` sub-components
- Extract: `useGitHubConnectionState()` hook

**`RecipientFields.tsx` (344 lines)**
- Extract: `<RecipientInput />` sub-component (the autocomplete input)
- Extract: `<RecipientChip />` sub-component
- Extract: `useRecipientSearch()` hook

**`GitHubRepoMappingsSection.tsx` (329 lines)**
- Extract: `<RepoMappingRow />` sub-component
- Extract: `useRepoMappings()` hook

**`TimePicker.tsx` (323 lines)**
- Extract: `<TimePickerDropdown />`, `<TimePickerInput />` sub-components

**`GitHubProjectBadges.tsx` (307 lines)**
- Extract: `<ProjectBadge />` sub-component
- Extract: `useProjectBadgeData()` hook

**`SummarizationRulesSection.tsx` (303 lines)**
- Extract: `<RuleListItem />` sub-component

**Components under 275 lines** (`AnalysisProgressModal`, `RichTextEditor`, `DataExportSection`, `SummarizationRuleEditForm`, `CategoryOverrideModal`, `KanbanColumn`, `SummarySection`, `EmailThreadView`, `GuideOurAISection`, `SummarizationRuleAddForm`, `DebugSyncHistorySection`, `CategorySection`, `CTAButton`, `SummarizationRuleDisplay`, `CustomRuleModal`, `GitHubIntegrationSection`, `EmailDetailHeader`):
- These are close to or within the 100-line function limit if they use sub-components
- Review each: if the main component function body exceeds 100 lines, extract the largest JSX section into a sub-component
- If within limits after extracting handlers, remove from override list

---

## 14. Client: `emailBodyUtils.ts` Override

**Current state:** 502 lines, overrides for `max-lines-per-function`, `max-statements`, `complexity`

### Refactoring Instructions

**Identify the large functions** (likely email body parsing/cleaning utilities) and extract:
1. HTML-to-text conversion logic → `htmlToTextUtils.ts`
2. Quote detection/stripping → `emailQuoteUtils.ts`
3. Signature detection → `emailSignatureUtils.ts`
4. Keep `emailBodyUtils.ts` as a re-export facade or the main entry point

Each extracted utility should contain pure functions under 100 lines with focused responsibilities.

---

## 15. Override Removal Checklist

After all refactoring is complete, these override blocks must be **deleted** from the ESLint configs:

### `server/.eslintrc.js` — Remove these override blocks:

- [ ] `files: ['src/emails/llm-processor.ts', 'src/emails/providers/gmail.provider.ts', 'src/context/context.service.ts', 'src/context/context-gmail-data.service.ts']` — the "legacy services" block
- [ ] `files: ['src/context/context-batch-analysis.processor.ts', 'src/emails/emails.service.ts', 'src/github/github-api.service.ts', 'src/llm/llm.service.ts', 'src/llm/priority-analysis.service.ts']` — the "additional large legacy modules" block

### `client/.eslintrc.js` — Remove these override blocks:

- [ ] The `**/hooks/useEmailDetailOperations.ts` ... `**/hooks/useInboxKeyboardNavigation.ts` "large hooks" block
- [ ] The `**/components/email-detail/EmailDetailActions.tsx` ... `**/components/landing/CTAButton.tsx` "large components" block
- [ ] The `**/utils/emailBodyUtils.ts` "utility files" block
- [ ] Add `'react/no-danger': 'off'` to the main rules section

### `client/src/components/common/SanitizedHTML.tsx`:

- [ ] Remove `// eslint-disable-next-line react/no-danger` comment

---

## Implementation Order (Suggested)

**Phase 5a — Quick wins (1-2 PRs):**
1. `react/no-danger` config fix + SanitizedHTML cleanup
2. `emails.service.ts` constructor refactor
3. `priority-analysis.service.ts` function extraction

**Phase 5b — Medium files (3-4 PRs):**
4. `context-batch-analysis.processor.ts` function extraction
5. `github-api.service.ts` file split
6. `context-gmail-data.service.ts` file split

**Phase 5c — Large files (4-5 PRs):**
7. `llm.service.ts` split into 8 domain services
8. `llm-processor.ts` split into 3 processors
9. `gmail.provider.ts` split into 3 files
10. `context.service.ts` split into 5 services

**Phase 5d — Client hooks & components (3-4 PRs):**
11. `useEmailDetailOperations.ts` split into 5 hooks
12. Remaining hook splits + exhaustive-deps fixes
13. Component extractions (batch by area: email-detail, settings, compose, etc.)
14. `emailBodyUtils.ts` split

**Phase 5e — Final cleanup:**
15. Remove all override blocks from both ESLint configs
16. Run `npm run lint` in both client and server — verify 0 errors with 0 overrides
17. Close #939

---

*Plan authored by Monk of Modularity 🧘 — AI agent (Focus Bear crew)*
*PR filed by OpenClaw automation*
