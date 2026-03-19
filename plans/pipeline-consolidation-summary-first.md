# Plan: Consolidate LLM Pipeline — Summary-First, Action Items in Summary Pass

**Branch:** `plan/pipeline-consolidation-summary-first`  
**Requested by:** Jeremy  
**Filed by:** Monk of Modularity  
**Status:** Ready for Codebeard

---

## Background

Jeremy requested two architectural changes:

1. **Only the summary prompt should receive the full email thread.** All other prompts (priority/categorisation, reply generation, suggested-actions detection) should work from the summarised output — not the raw thread.
2. **Can the summary prompt also extract action items in the same pass?** (Combine the `extractActionItems` LLM call with the summary step.)

---

## Current Pipeline (Audit)

### Where the full email body/thread flows today

```
Full Thread / Raw Body
        │
        ├─── summarizeEmailWithPhishingCheck()     ← ✅ CORRECT — summary step owns this
        │        summarize-email-tldr.md
        │        summarize-email-bullets.md
        │        summarize-email-actions.md
        │        (phishing + sentiment + category in same call)
        │
        ├─── detectSuggestedActions()              ← ❌ RAW BODY — should use summary
        │        suggest-actions.md
        │        called from SuggestedActionsService
        │        receives: email.body + email.htmlBody (raw)
        │
        ├─── generateReplyOptions()                ← ⚠️ PARTIAL — main email body is raw;
        │        generate-multiple-replies.md            thread history uses email.body per message
        │        called from SuggestedRepliesProcessor
        │        receives: latestEmail.body (raw) + threadMessages[].body (raw)
        │
        ├─── generateReplyDraft()                  ← ❌ RAW BODY — should use summary
        │        generate-reply.md
        │        called from RepliesService
        │        receives: originalEmail.body (raw)
        │
        ├─── extractActionItems()                  ← ❌ SEPARATE CALL — receives raw body
        │        extract-action-items.md               (only exposed via POST /llm/extract-actions)
        │        NOTE: This endpoint is not called from
        │        any pipeline processor — it's an on-demand
        │        API endpoint only. Not part of the background
        │        processing pipeline currently.
        │
        ├─── analyzePriority()                     ← ✅ ALREADY FIXED — uses email.summary
        │        prioritise-email.md                    with fallback to cleaned body
        │        Falls back to cleanEmailContent()
        │        if no summary yet
        │
        ├─── analyzePriorityBatch()                ← ✅ ALREADY FIXED — uses email.summary
        │        Uses email.summary with fallback        with explicit architecture comment
        │
        ├─── checkIfRecalcNeeded()                 ← ⚠️ USES NEW EMAIL BODY
        │        incremental-priority-check.md          (correct — this is the delta email,
        │                                               not full thread; acceptable)
        │
        └─── updateSummaryIncrementally()          ← ⚠️ USES NEW EMAIL BODY
                 incremental-summary.md                 (correct — receives the NEW message
                                                        to update existing summary; acceptable)
```

### What the summary step currently returns

`summarizeEmailWithPhishingCheck()` / `summarizeCustomPromptWithPhishing()` return:

```typescript
{
  summary: string;
  phishing: PhishingLLMResult | null;
  sentiment: { score: number; explanation: string } | null;
  category: string | null;
  categoryExplanation: string | null;
}
```

The `action-items` summary type (`summarize-email-actions.md`) produces a `summary` field that **is** a textual action-item list — but this is user-facing display text, not a structured `actionItems[]` array for programmatic use.

The `extractActionItems()` method is a **separate LLM call** that returns `Array<{ description: string; confidence: number }>`. It is currently only called on-demand via `POST /llm/extract-actions` (not from any background pipeline processor).

---

## Proposed Pipeline

```
Full Thread / Raw Body
        │
        └─── Step 1: summarizeEmailWithPhishingCheck()   ← ONLY consumer of raw thread
                      Returns: {
                        summary: string,
                        phishing: PhishingLLMResult | null,
                        sentiment: { score, explanation } | null,
                        category: string | null,
                        categoryExplanation: string | null,
                        actionItems: Array<{ description, confidence }> | null   ← NEW
                      }

Compact Summary + actionItems (stored to DB)
        │
        ├─── Step 2a: analyzePriority() / analyzePriorityBatch()
        │             receives: email.summary  (already done ✅)
        │
        ├─── Step 2b: detectSuggestedActions()
        │             receives: email.summary  (CHANGE REQUIRED)
        │
        ├─── Step 2c: generateReplyOptions()
        │             receives: email.summary for main email  (CHANGE REQUIRED)
        │             threadMessages: use emailEntry.summary || emailEntry.body  (partial fix)
        │
        └─── Step 2d: extractActionItems() on-demand endpoint
                      Can delegate to stored DB action items (OPTIONAL FUTURE WORK)
                      or keep calling with raw body (low priority — not in pipeline)
```

---

## Changes Required

### Change 1: Summary prompt — add `actionItems[]` to response (HIGH VALUE)

**Files:**
- `server/promptfoo/prompts/summarize-email-tldr.md`
- `server/promptfoo/prompts/summarize-email-bullets.md`
- `server/promptfoo/prompts/summarize-email-actions.md`
- `server/src/llm/llm.service.ts` — `parseSummaryWithPhishing()`
- `server/src/emails/llm-processor.ts` — `fireSummaryLlmCalls()` + `saveSummaryResults()`
- `server/src/database/entities/email.entity.ts` — add `actionItemsJson` column (or new table)
- Migration: add column for storing action items from summary pass

**What changes in the prompt:**
Add to the JSON response schema in all three summary prompt templates:
```json
"actionItems": [
  { "description": "<task the recipient needs to do>", "confidence": 0.0-1.0 }
]
```

The `summarize-email-actions.md` template already extracts action items into the `summary` text field. For TLDR and bullet summaries, the LLM sees the full thread and can identify action items simultaneously with zero extra cost.

**What changes in the parser:**
`parseSummaryWithPhishing()` in `llm.service.ts` should also extract `actionItems` from the JSON and return them alongside `summary`, `phishing`, `sentiment`, `category`.

**Storage:**
Store the action items array as `actionItemsJson` (JSONB column) on the `emails` table, or directly insert into the `action_items` table during `saveSummaryResults()`.

---

### Change 2: `detectSuggestedActions()` — switch to summary (MEDIUM, RAW BODY LEAK)

**File:** `server/src/suggested-actions/suggested-actions.service.ts` (lines 193–214)

**Current:**
```typescript
const actions = await this.llmService.detectSuggestedActions({
  subject: email.subject,
  body: email.body || "",          // ← RAW BODY
  htmlBody: email.htmlBody || undefined,
  from: email.from,
  fromName: email.fromName || undefined,
}, ...);
```

**Proposed:**
```typescript
const actions = await this.llmService.detectSuggestedActions({
  subject: email.subject,
  body: email.summary || cleanEmailContent(email.body || "", null, BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW),
  // htmlBody no longer needed — summary is plain text
  from: email.from,
  fromName: email.fromName || undefined,
}, ...);
```

**Notes:**
- The `detectSuggestedActions()` function cleans body via `cleanEmailContent()` to 1000 chars anyway. Replacing with the summary (typically 200–400 chars) is a strict improvement.
- The GitHub link parsing (`parseGitHubLinks`) runs against `email.body` and `email.htmlBody` and should **stay** on the raw body — it's regex-based, not LLM-based, and needs URLs from the original HTML.
- `suggest-actions.md` prompt receives `body` only; the `githubContext` variable is constructed separately from `parseGitHubLinks`. This change is safe.

---

### Change 3: `generateReplyOptions()` — switch main email body to summary (LOW-MEDIUM)

**File:** `server/src/suggested-replies/suggested-replies.processor.ts` (lines 314–326)

**Current:**
```typescript
return this.llmService.generateReplyOptions(
  {
    from: latestEmail.from || "",
    fromName: latestEmail.fromName || undefined,
    subject: latestEmail.subject || "",
    body: latestEmail.body || "",   // ← RAW BODY
  },
  userContext,
  undefined,
  userId,
  threadMessages,  // threadMessages[].body is also raw
);
```

**Proposed:**
```typescript
return this.llmService.generateReplyOptions(
  {
    from: latestEmail.from || "",
    fromName: latestEmail.fromName || undefined,
    subject: latestEmail.subject || "",
    body: latestEmail.summary || cleanEmailContent(latestEmail.body || "", null, BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW),
  },
  userContext,
  undefined,
  userId,
  threadMessages.map(msg => ({
    ...msg,
    body: msg.summary || msg.body,  // prefer summary if available on thread message
  })),
);
```

**Caveats:**
- Reply generation benefits from the **actual email wording** — tone, phrasing, specific language the sender used. A summary may lose nuance needed for high-quality replies.
- **Recommendation:** Use summary for the main email body only if a summary exists. Keep raw body as fallback. For `threadMessages`, the existing approach (raw body with `SUBSTRING_BODY_PREVIEW` cap) is already reasonably bounded.
- This is lower risk than the suggested-actions change since the reply generator is not running in the background pipeline.

---

### Change 4: `generateReplyDraft()` — switch to summary (LOW)

**File:** `server/src/replies/replies.service.ts` (line ~142)

Same pattern as Change 3 — pass `email.summary || cleanedBody` instead of raw body.

---

## What Does NOT Need to Change

| Component | Reason |
|---|---|
| `analyzePriority()` / `analyzePriorityBatch()` | Already uses `email.summary` with fallback ✅ |
| `checkIfRecalcNeeded()` | Receives the new delta email (not full thread) — correct ✅ |
| `updateSummaryIncrementally()` | Receives the new message to update summary — correct ✅ |
| `extractActionItems()` API endpoint | On-demand only; not in pipeline. Keep for backward compat. |
| GitHub link parsing in SuggestedActionsService | Regex-based on HTML — must keep raw body ✅ |
| Contact type auto-classification | Uses `email.body` in `saveSummaryResults` — this is fine because it runs IN the summary step ✅ |

---

## Feasibility of Combining Summary + Action Items

### Can we add `actionItems: []` without degrading summary quality?

**Yes — strongly recommended for TLDR and bullet summary types.**

Rationale:
- The LLM sees the full thread during the summary step. It's the ideal time to identify action items.
- Adding a structured `actionItems` array to the JSON response costs ~50–100 extra output tokens.
- The summary field quality is unaffected — the model produces both independently.
- The `summarize-email-actions.md` template already asks the LLM to extract action items into the `summary` text; adding a structured field is a natural extension.

**Custom prompt type:** More care needed. Custom prompts inject a `phishingFooter` that specifies the exact JSON schema. The action items field would need to be added to the injected footer in `summarizeCustomPromptWithPhishing()`.

### Token / latency tradeoffs

| Scenario | Current | Proposed |
|---|---|---|
| Summary call output tokens | ~300 (TLDR) | ~400 (TLDR + actionItems) |
| Separate `extractActionItems` call | ~800 input + ~200 output = ~1,000 tokens | Eliminated from pipeline |
| Net change per email (if pipeline-integrated) | baseline | **−600 tokens** (saves separate call) |
| Net change (on-demand endpoint only) | no pipeline call | +100 output tokens to summary |

**Conclusion:** If action items are generated during the summary pass and stored, the on-demand `POST /llm/extract-actions` endpoint can read from the cache instead of making a fresh LLM call. Net saving ≈ 600 tokens per email that users request action items for.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Summary not yet generated when suggested-actions is called | Medium | Fallback to cleanEmailContent() already in place |
| Reply quality degraded if summary is used instead of raw body | Medium | Use raw body as fallback; only switch when summary exists |
| Action items in summary pass may miss context present only deep in thread | Low | Summary step already receives full thread; same LLM context |
| Schema change to summary JSON breaks parseSummaryWithPhishing() | Low | `actionItems` parsed with `parsed.actionItems || []` — safe default |
| DB migration for storing action items from summary | Low | JSONB column with nullable default; backward compatible |
| Custom prompt phishing footer schema must include actionItems | Low | One additional line in the injected footer |
| `summarize-email-actions.md` has dual role (display text + structured array) | Medium | After this change, `summary` field remains human-readable list; `actionItems` is structured. Keep both. |

---

## Implementation Order (Recommended for Codebeard)

1. **Prompt changes** — Add `actionItems: []` to JSON schema in all three summary prompt templates (`summarize-email-tldr.md`, `summarize-email-bullets.md`, `summarize-email-actions.md`). Also update the injected phishing footer in `summarizeCustomPromptWithPhishing()`.

2. **Parser update** — Update `parseSummaryWithPhishing()` in `llm.service.ts` to extract and return `actionItems`.

3. **DB + storage** — Add `actionItemsJson` JSONB column to `emails` table (nullable). Update `saveSummaryResults()` in `llm-processor.ts` to write action items from the summary result.

4. **SuggestedActionsService fix** — Change `detectSuggestedActions()` call to use `email.summary` (Change 2 above). This is the highest-value raw-body leak to close.

5. **Reply generation fix** — Change `generateReplyOptions()` and `generateReplyDraft()` to use `email.summary` with raw-body fallback (Changes 3 + 4).

6. **On-demand endpoint** — Update `POST /llm/extract-actions` controller to check for stored `actionItemsJson` before making a fresh LLM call (optional optimisation).

---

## Files Changed Summary

| File | Change Type |
|---|---|
| `server/promptfoo/prompts/summarize-email-tldr.md` | Add `actionItems` to JSON schema |
| `server/promptfoo/prompts/summarize-email-bullets.md` | Add `actionItems` to JSON schema |
| `server/promptfoo/prompts/summarize-email-actions.md` | Add `actionItems` to JSON schema |
| `server/src/llm/llm.service.ts` | Update `parseSummaryWithPhishing()` return type + parsing; update `summarizeCustomPromptWithPhishing()` phishing footer |
| `server/src/emails/llm-processor.ts` | Update `saveSummaryResults()` to store action items |
| `server/src/database/entities/email.entity.ts` | Add `actionItemsJson?: object[]` JSONB column |
| `server/src/database/migrations/XXXXXXXXX-AddActionItemsJsonToEmails.ts` | DB migration |
| `server/src/suggested-actions/suggested-actions.service.ts` | Use `email.summary` in `detectSuggestedActions()` call |
| `server/src/suggested-replies/suggested-replies.processor.ts` | Use `email.summary` in `generateReplyOptions()` call |
| `server/src/replies/replies.service.ts` | Use `email.summary` in `generateReplyDraft()` call |
| `server/src/llm/llm.controller.ts` | (Optional) Read from stored action items before LLM call |

---

*Authored by: Monk of Modularity (OpenClaw subagent)*  
*Investigation commit: pipeline audit against `main` branch, 2026-03-18*
