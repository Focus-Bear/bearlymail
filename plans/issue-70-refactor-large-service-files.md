# Plan: Refactor Large Service Files to Reduce Complexity

**Issue:** #70  
**Author:** monk-of-modularity[bot]  
**Date:** 2026-03-23  
**Status:** PLANNING

## Problem Statement

Three service files in `server/src/` exceed the 800-line `max-lines` ESLint limit and are suppressed via per-file overrides in `.eslintrc.js` (raised to `max: 4000`). These "god class" files also have relaxed `max-lines-per-function` (1200), `max-statements` (400), `complexity` (250), and `max-params` overrides.

### Current State (as of 2026-03-23)

| File | Lines | Override max-lines | Override max-params |
|------|-------|--------------------|---------------------|
| `server/src/context/context.service.ts` | 3,626 | 4,000 | 17 |
| `server/src/llm/llm.service.ts` | 3,219 | 4,000 | (none) |
| `server/src/emails/llm-processor.ts` | 2,198 | 4,000 | 16 |

Additionally, 12 more files exceed 800 lines (non-test, non-migration), though these are NOT currently suppressed in `.eslintrc.js`:

| File | Lines |
|------|-------|
| `context-gmail-data.service.ts` | 1,000 |
| `summarization.service.ts` | 969 |
| `github-api.service.ts` | 956 |
| `email-debug.service.ts` | 953 |
| `emails.controller.ts` | 942 |
| `email-search.service.ts` | 936 |
| `auto-responder.service.ts` | 894 |
| `contacts.service.ts` | 856 |
| `email-inbox.service.ts` | 848 |
| `calendar.service.ts` | 848 |
| `gmail-sync.service.ts` | 817 |
| `priority-learning.service.ts` | 806 |

### Prior Work

Phase 5 (issue #939) has already made progress:
- `gmail.provider.ts` and `context-gmail-data.service.ts` were previously removed from ESLint overrides (now compliant or near-compliant)
- Phase 6a extracted `context-compression.service.ts`
- Phase 6b extracted `getAnalysisRecordById` + `getCompletedBatchCount` helpers
- The ESLint comments mention "Phase 5g" for further splits

## Proposed Decomposition

### Phase A: `context.service.ts` (3,626 → target ≤ 800 per file)

This service has several distinct responsibility clusters:

1. **ContextCrudService** (already partially extracted) — CRUD operations for user context entries (`createOrUpdateContext`, `updateContext`, `deleteContext`)
2. **ContextAnalysisService** — The main `analyzeAndLearnFromEmails` orchestration (lines ~571–1640), including thread fetching, batch creation, job queueing
3. **ContextAnalysisProgressService** — `getAnalysisProgress` (lines ~85–570) with complex progress calculation and insight extraction
4. **ContextAnalysisFinalizer** — `finalizeContextAnalysis` (line ~2435+) and `checkBatchesComplete` (line ~2133+)
5. **ContextSyncService** — `checkAndSyncJobs` (line ~1882+) for batch job synchronisation
6. **ContextCategoryService** — `consolidateExistingCategories`, `generateCategoriesFromOther` (lines ~3585+)
7. **ContextCompressionService** — already extracted in Phase 6a

**Suggested split (5 new files):**
- `context-analysis-orchestrator.service.ts` — `analyzeAndLearnFromEmails` + thread fetching logic
- `context-analysis-progress.service.ts` — `getAnalysisProgress` with progress/insight extraction
- `context-analysis-finalizer.service.ts` — `finalizeContextAnalysis`, `checkBatchesComplete`
- `context-sync.service.ts` — `checkAndSyncJobs`, `getCompletedBatchCount`, `getAnalysisRecordById`
- `context-category.service.ts` — category consolidation and generation

The residual `context.service.ts` becomes a thin facade (~200 lines) delegating to sub-services.

### Phase B: `llm.service.ts` (3,219 → target ≤ 800 per file)

This service has clear domain clusters by LLM task type:

1. **LlmEmailAnalysisService** — `analyzeEmailPatterns`, `buildReceivedEmailStats`, `buildSentEmailStats`, `buildEmailTimeAnalysis`, `parsePatternResponse`
2. **LlmSummaryService** — `summarizeEmail`, `summarizeEmailWithPhishingCheck`, `parseSummaryWithPhishing`, `summarizeCustomPromptWithPhishing`, `summarizeThreads`, `parseBatchSummaryResponse`
3. **LlmToneService** — `checkTone`
4. **LlmActionItemsService** — `extractActionItems`, `detectSuggestedActions`, `buildActionsPromptContext`, `parseAndFilterActions`
5. **LlmReplyService** — `generateReplyOptions`, `generateReplyDraft`, `generateMeetingReply`, `generateFollowUpDraft`, `buildReplyThreadContext`
6. **LlmOverrideAnalysisService** — `analyzeOverrideReason`
7. **LlmPhishingValidation** (private helpers) — `validatePhishingLLMResult`, `validateActionItems`, `validateSentimentResult`
8. **LlmProviderService** — `getAvailableProviders`, `generateText`

**Suggested split (4 new files):**
- `llm-email-analysis.service.ts` — pattern analysis + stats builders
- `llm-summary.service.ts` — email/thread summarisation + phishing checks
- `llm-actions.service.ts` — action items, suggested actions, tone checking
- `llm-reply.service.ts` — reply generation (options, drafts, meeting, follow-up)

The residual `llm.service.ts` becomes a facade (~300 lines) with `generateText`, `getAvailableProviders`, and validation helpers.

### Phase C: `llm-processor.ts` (2,198 → target ≤ 800 per file)

This Bull queue processor has mixed concerns:

1. **LlmProcessorOrchestrator** — `onModuleInit`, batch processing worker callback
2. **LlmBatchPayloadBuilder** — `buildBatchEmailPayloads`, `buildUserContext`
3. **LlmPriorityCalculator** — `calculatePriorityBreakdown`, `calculateScoreContributions`, `buildPriorityDimensions`
4. **LlmSentimentMapper** — `getSentimentType`, `getSentimentDescription`
5. **LlmThreadAnalyzer** — `determineThreadReplyStatus`, `canUseIncrementalAnalysis`, `extractEmailAddress`
6. **LlmCategoryMapper** — `canonicaliseCategoryName`

**Suggested split (3 new files):**
- `llm-processor-payload.service.ts` — batch payload building + user context assembly
- `llm-processor-priority.service.ts` — priority calculation, score contributions, dimensions
- `llm-processor-helpers.ts` — sentiment mapping, thread reply status, incremental analysis check, category name canonicalisation

The residual `llm-processor.ts` becomes the Bull worker orchestrator (~600 lines).

### Phase D: ESLint Cleanup

After each phase, remove the corresponding file override block from `.eslintrc.js`. The target is to remove ALL three override blocks and have every file pass the default `max-lines: 800` rule.

## Implementation Order

1. **Phase A** — `context.service.ts` (highest line count, most complex)
2. **Phase B** — `llm.service.ts` (second highest)
3. **Phase C** — `llm-processor.ts` (third)
4. **Phase D** — ESLint override cleanup (after all splits merged)

Each phase should be a separate PR to keep reviews manageable. Each PR should:
- Move methods to the new service file
- Register the new service in the NestJS module
- Update all imports across the codebase
- Add/update unit tests
- Remove or tighten the ESLint override for the file
- Verify `npm run lint` passes

## Risks & Considerations

- **Circular dependencies**: The new sub-services may need to inject each other. Use `forwardRef()` or restructure to avoid cycles. Prefer one-directional dependency flow.
- **Constructor parameter count**: `context.service.ts` has 17 constructor params. Splitting should reduce this naturally as dependencies move to sub-services.
- **Test coverage**: Existing tests in `*.spec.ts` files will need updating to mock the new sub-services.
- **12 additional files above 800 lines**: These are NOT currently suppressed but should be addressed in follow-up issues to prevent future suppression needs.

## Success Criteria

- [ ] All three files under 800 lines
- [ ] All ESLint overrides for these files removed from `.eslintrc.js`
- [ ] `npm run lint` passes without any `max-lines` suppressions for production code
- [ ] No regressions in existing tests
- [ ] No circular dependency warnings from NestJS

---
*Plan authored by monk-of-modularity[bot] 🧘 — "A thousand-line file is just many small files that haven't found their way home yet."*
