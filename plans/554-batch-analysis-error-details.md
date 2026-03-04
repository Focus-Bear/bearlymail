# Plan: Show Specific Errors and Correlation IDs for Batch Analysis Failures

**Issue:** #554
**Type:** Bug / Enhancement
**Effort:** Medium (2-4 hours)

## Goal

When batch analysis fails, the Admin panel should display the specific error for each failed batch alongside a correlation ID that can be looked up in PostHog for debugging.

## Current State

- `ContextAnalysisSection.tsx` already shows failure details when expanded (batch index, error string, timestamp)
- `FailureDetail` interface has: `batchIndex`, `error`, `failedAt`
- The analysis-level `correlationId` (UUID) exists and is displayed/copyable
- Batch failures are stored in `stats.batchResults[batchIndex]` with `{ error, failedAt }`
- PostHog captures are done via `logError()` / `logWarn()` in `server/src/utils/logger.ts`
- **Missing:** Per-batch-failure correlation IDs, PostHog event linkage, and surfacing the specific error type (LLM timeout, rate limit, parsing error, etc.)

## Steps

### 1. Generate per-batch-failure correlation IDs (Server)

**File:** `server/src/context/context-batch-analysis.processor.ts`

In the catch block where batch failures are recorded (~line 670-700):

- Generate a unique correlation ID per batch failure: `const batchCorrelationId = randomUUID()`
- Store it in `batchResults[batchIndex]`: `{ error, failedAt, correlationId: batchCorrelationId }`
- Pass the correlation ID to `logError()` so it's captured in PostHog:
  ```ts
  logError(
    `[BATCH-PROCESSOR] Batch ${batchIndex + 1}/${totalBatches} failed: ${errorMessage}`,
    undefined,
    { correlationId: batchCorrelationId, batchIndex, analysisId: analysisRecordId }
  );
  ```

### 2. Classify error types (Server)

**File:** `server/src/context/context-batch-analysis.processor.ts`

Add error classification before storing the failure:

```ts
function classifyBatchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) return 'timeout';
  if (message.includes('token') && message.includes('limit')) return 'token_limit';
  if (message.includes('parse') || message.includes('JSON')) return 'parse_error';
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) return 'network_error';
  return 'unknown';
}
```

Store the classification: `{ error, failedAt, correlationId, errorType }`

### 3. Update the API response (Server)

**File:** `server/src/context/context.controller.ts`

Ensure the endpoint that returns analysis data maps `stats.batchResults` into the `failureDetails` array with the new fields:

```ts
failureDetails: Object.entries(stats.batchResults || {}).map(([idx, result]) => ({
  batchIndex: Number(idx),
  error: result.error,
  failedAt: result.failedAt,
  correlationId: result.correlationId || null,
  errorType: result.errorType || 'unknown',
}))
```

### 4. Update the Admin UI (Client)

**File:** `client/src/components/admin/ContextAnalysisSection.tsx`

Update `FailureDetail` interface:

```ts
interface FailureDetail {
  batchIndex: number;
  error: string;
  failedAt: string | null;
  correlationId: string | null;  // NEW
  errorType: string | null;       // NEW
}
```

In the failure details expansion panel, add for each failure:
- An error type badge (color-coded: red for rate_limit, orange for timeout, etc.)
- A copyable correlation ID button (reuse the existing copy-to-clipboard pattern)
- A "View in PostHog" link: `https://app.posthog.com/events?properties=[{"key":"correlationId","value":"${correlationId}","operator":"exact"}]`
  (Exact PostHog URL format should be verified against the team's PostHog project settings)

### 5. Add i18n keys (Client)

**File:** `client/src/locales/en/translation.json` (and other locale files)

Add keys:
```json
{
  "admin.contextAnalysis.errorType": "Error Type",
  "admin.contextAnalysis.errorType.rate_limit": "Rate Limited",
  "admin.contextAnalysis.errorType.timeout": "Timeout",
  "admin.contextAnalysis.errorType.token_limit": "Token Limit",
  "admin.contextAnalysis.errorType.parse_error": "Parse Error",
  "admin.contextAnalysis.errorType.network_error": "Network Error",
  "admin.contextAnalysis.errorType.unknown": "Unknown",
  "admin.contextAnalysis.viewInPosthog": "View in PostHog",
  "admin.contextAnalysis.batchCorrelationId": "Batch Correlation ID"
}
```

## Risks

- **PostHog URL format:** The "View in PostHog" link format depends on the project configuration. May need adjustment.
- **Existing data:** Old failures won't have `correlationId` or `errorType`. The UI already handles nulls gracefully (shows "null" in italics). Apply the same pattern for new fields.
- **Stats column type:** `stats` is a JSON column. Adding new fields to `batchResults` entries is backward-compatible — no migration needed.

## Testing

- Manually trigger a batch analysis failure (e.g., with an invalid LLM API key or by rate-limiting)
- Verify the Admin panel shows: error type badge, per-batch correlation ID, PostHog link
- Verify the correlation ID appears in PostHog events
- Verify old analyses (without new fields) still render correctly
- Unit tests for `classifyBatchError()` function
