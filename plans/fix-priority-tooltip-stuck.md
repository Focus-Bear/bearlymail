# Plan: Fix priority explanation tooltip stuck on "Loading priority explanation..."

**Issue:** Priority explanation tooltip shows "Loading priority explanation..." and never resolves in production.
**Priority:** P1 (user-facing tooltip broken for all users)
**Root cause confidence:** High

## Root Cause Analysis

### Data Flow Trace

1. **User clicks priority badge** → `PriorityBadge.tsx` calls `togglePriorityTooltip(emailId)`
2. **Hook fires** → `usePriorityTooltip.ts` sets `loadingPriorityExplanation=true`, calls `GET /emails/:id/priority-explanation`
3. **Server endpoint** → `emails.controller.ts` → `emailsService.getPriorityExplanation()` → `emailPriorityExplanationService.getPriorityExplanation()`
4. **Service reads thread** → `emailThreadRepository.findOne({ where: { id: email.emailThreadId } })`
5. **TypeORM hydrates** → `encryptedJsonTransformer.from()` runs `tryDecrypt()` then `JSON.parse()` on `priorityExplanation`
6. **Service returns** → `normalizePriorityExplanation(thread.priorityExplanation, sentimentScore)`

### The Bug: Two Related Issues

#### Issue 1: `computeFallbackExplanation` missing `decryptUserContextEntityForApi` on contexts

In `email-priority-explanation.service.ts`, the `computeFallbackExplanation` method loads user contexts with:
```ts
const contexts = await this.userContextRepository.find({ where: { userId } });
```

This raw `find()` relies on TypeORM column transformers. However, PR #1608 established the pattern that **all read paths must also call `decryptUserContextEntityForApi()`** as a safety net (matching the pattern added in `priority.service.ts` and `priority-cache.service.ts` in that same PR). The fallback path in `email-priority-explanation.service.ts` was missed.

If the TypeORM transformer fails to decrypt (a known edge case documented in `entity-api-decrypt.util.ts` header comment), the context values remain encrypted. The `buildExplanationDimensions` method then compares encrypted VIP contact strings against plaintext sender emails — no match is found, and the result contains only "Calculating..." placeholder items.

The "Calculating..." items trigger `checkAndQueuePriorityRecalculation` to queue a `refine-priority` job, but if the same decryption issue affects the job worker, it enters a loop of calculating → returning partial → re-queuing → never completing.

#### Issue 2: Client stuck in "Loading" state after API error or empty response

In `PriorityTooltip.tsx`, the rendering logic is:
```tsx
if (!priorityExplanation && !loadingPriorityExplanation) {
  return <PriorityTooltipLoading emailId={emailId} />;
}
```

`PriorityTooltipLoading` renders a **fixed-position portal** with "Loading priority explanation..." — but this is shown when loading is **finished** and explanation is **null**. This happens when:
- The API call errors (catch block sets `loadingPriorityExplanation=false` but doesn't update `priorityExplanation`)
- The API call times out (10s timeout in the hook)
- The API returns data but the response doesn't match the expected structure

The component name `PriorityTooltipLoading` is misleading — it's actually the **error/empty state**, not a loading state. The actual loading state is handled inside `PriorityTooltipContent` which shows `t('common.loading')` = "Loading...".

So the user sees "Loading priority explanation..." permanently because the API call failed and there's no retry or error feedback.

### Connection to PRs #1605 and #1608

- **PR #1605** fixed ciphertext leaking to the UI by introducing `tryDecrypt()` circuit-breaker and `entity-api-decrypt.util.ts`
- **PR #1608** added `decryptUserContextEntityForApi()` calls to many read paths: `priority.service.ts`, `priority-cache.service.ts`, `email-inbox.service.ts`, etc.
- **Missing from #1608:** The `computeFallbackExplanation` path in `email-priority-explanation.service.ts` was not updated with the same pattern
- The `encryptedJsonTransformer` on `EmailThread.priorityExplanation` should handle decryption via TypeORM, but the fallback computation path that **writes** new explanations can produce broken data when contexts aren't decrypted

## Fix Plan

### File 1: `server/src/emails/email-priority-explanation.service.ts`

**Change:** Add `decryptUserContextEntityForApi()` to the `computeFallbackExplanation` method's context loading.

```ts
// In computeFallbackExplanation():
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";

// After loading contexts:
const contexts = await this.userContextRepository.find({ where: { userId } });
for (const ctx of contexts) {
  decryptUserContextEntityForApi(ctx);
}
```

This matches the pattern established in PR #1608 for `priority.service.ts` and `priority-cache.service.ts`.

### File 2: `client/src/components/priority/PriorityTooltip.tsx`

**Change:** Fix the misleading empty-state rendering. When `!priorityExplanation && !loadingPriorityExplanation`, this is an **error state**, not a loading state. Show an error message with a retry option instead of a permanent "Loading..." text.

```tsx
if (!priorityExplanation && !loadingPriorityExplanation) {
  return (
    <PriorityTooltipContainer emailId={emailId}>
      <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
        <div>{t('priority.tooltip.errorLoading')}</div>
        <button onClick={() => /* trigger refetch */}>
          {t('common.retry')}
        </button>
      </div>
    </PriorityTooltipContainer>
  );
}
```

### File 3: `client/src/locales/en.json` (and `es.json`)

**Change:** Add `priority.tooltip.errorLoading` translation key:
```json
"priority": {
  "tooltip": {
    "errorLoading": "Unable to load priority details. Click to retry."
  }
}
```

### File 4: `client/src/hooks/usePriorityTooltip.ts`

**Change:** Add error state tracking and expose a retry mechanism. Currently the hook silently swallows errors, leaving `priorityExplanation` as null with no way for the UI to distinguish "never fetched" from "fetch failed".

```ts
const [fetchError, setFetchError] = useState(false);

// In fetchPriorityExplanation catch:
setFetchError(true);

// In togglePriorityTooltip:
setFetchError(false); // Reset on new toggle

// Return fetchError in the hook result
```

### Testing Notes

1. **Unit test:** Verify `computeFallbackExplanation` correctly decrypts contexts before building dimensions
2. **Integration test:** Mock a scenario where `encryptedJsonTransformer` returns encrypted data, confirm `decryptUserContextEntityForApi` is called as fallback
3. **Client test:** Verify PriorityTooltip shows error state (not infinite loading) when API fails
4. **Manual test:** Click priority badge in production → tooltip should show breakdown, not "Loading priority explanation..."

### Risk Assessment

- **Low risk:** Server-side change is additive — adds a decrypt safety net matching existing pattern
- **Low risk:** Client-side change improves UX for error cases without changing happy path
- **No migration needed:** No schema changes
