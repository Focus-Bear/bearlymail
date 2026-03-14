# Plan: #779 — Summarisation prompt should include sentiment + prioritisation should use summary not full email

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/779

---

## Problem Analysis

Two related issues with the LLM pipeline:

1. **Sentiment is computed twice (or incorrectly piped):** The `summarize-email-tldr.md` prompt already returns a `sentiment` field with a score. The `prioritise-email.md` prompt says "Sentiment has already been computed from the summary step — do NOT include sentimentScore in your output." However, if the priority analysis service (`PriorityAnalysisService.analyzePriority`) is still receiving the raw email `body` rather than the summary output, the sentiment value computed during summarisation is never passed through.

2. **Prioritisation uses raw email body, not summary:** In `analyzePriority`, the email body is passed directly (after cleaning) but it should be using the pre-computed summary text. This causes the LLM to re-process the full email body instead of the concise summary, wasting tokens and potentially getting inconsistent results.

---

## Root Cause Hypothesis

### Issue 1 — Sentiment not in prioritisation flow
- The summary step computes `sentiment.score` and stores it.
- The priority analysis step receives `sentimentScore: 0` as a fallback because the sentiment from the summary is not being passed as an argument to `analyzePriority`.
- The `analyzePriority` return type accepts `sentimentScore` but its prompt explicitly says not to compute it — meaning the value should come from the caller, but the caller (in `llm-processor.ts` or similar) may not be passing the cached sentiment.

### Issue 2 — Priority analysis uses full email body
- In `PriorityAnalysisService.analyzePriority`, the email body is cleaned with `cleanEmailContent` and passed to the prompt as `{{body}}`. The prompt labels this field as "Summary" (in the template: `Summary: {{body}}`), but the actual content being passed is the original email body, not the LLM-generated summary.
- The batch analysis in `analyzePriorityBatch` similarly uses `cleanedBody` labeled as `Summary` in the email description.

---

## Implementation Steps

### Step 1: Pass summary text to priority analysis (Issue 2)

**File:** `server/src/emails/llm-processor.ts` (or wherever `analyzePriority` / `analyzePriorityBatch` are called)

- After summarisation completes for an email, pass the generated `summary` text as the `body` argument to the priority analysis instead of the raw email body.
- The prompt template already labels the field as `Summary:` — we just need to honour that by passing the actual summary.

### Step 2: Pass pre-computed sentiment score to priority analysis (Issue 1)

**File:** `server/src/llm/priority-analysis.service.ts`

- Add a `sentimentScore?: number` parameter to the `analyzePriority` method signature.
- If the caller provides a pre-computed `sentimentScore` (from the summary step), use it directly in the returned result instead of defaulting to `0`.
- This avoids asking the LLM to compute sentiment again (it's already instructed not to).

**File:** `server/src/emails/llm-processor.ts` (or wherever priority is called)
- Extract the `sentiment.score` from the completed summary and pass it to `analyzePriority`.

### Step 3: Ensure sentiment in summarisation prompt output (if missing)

**File:** `server/promptfoo/prompts/summarize-email-tldr.md`
- Verify the `sentiment` field is present in the returned JSON schema. It currently is — the prompt includes `"sentiment": { "score": ..., "explanation": ... }`.
- No changes needed here if sentiment is already being computed and stored.

### Step 4: Update batch priority analysis

**File:** `server/src/llm/priority-analysis.service.ts` — `analyzePriorityBatch`
- Similarly accept pre-computed summaries and sentiment scores per email in the batch input.
- The `emailKey` input array already has a `body` field — add an optional `summary` and `sentimentScore` field.
- If `summary` is provided, use it as the email body passed to the LLM.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/llm/priority-analysis.service.ts` | Accept optional `sentimentScore` + optional `summary` params; use summary as body if provided |
| `server/src/emails/llm-processor.ts` | Pass summary text and sentiment score from summary result into priority analysis calls |
| `server/promptfoo/prompts/prioritise-email.md` | Minor: confirm the `{{body}}` field description says "Summary" (already does) |

---

## Testing Approach

1. **Unit tests** (`server/src/llm/priority-analysis.service.spec.ts` if exists):
   - Verify that when `sentimentScore` is provided, the returned result uses that value.
   - Verify that when a `summary` is provided as body, the prompt uses it.

2. **Integration test:**
   - Process a test email through the full pipeline (summarise → prioritise).
   - Assert that the priority analysis LLM call receives the summary text, not the full email body.
   - Assert that the final priority result includes the sentiment score computed during summarisation.

3. **Manual verification:**
   - Check PostHog/logs to confirm the priority prompt is shorter (summary, not full email body).
   - Confirm `sentimentScore` values in the DB are non-zero for emails that have summaries with clear sentiment.

---

## Notes

- The batch prompt already explicitly says "Sentiment has already been computed from the full thread — do NOT include sentimentScore in your output." — the LLM is already being told this, but the actual pre-computed value needs to be injected.
- This is a relatively low-risk change: if no summary is available, fall back to using the cleaned email body (current behaviour).
