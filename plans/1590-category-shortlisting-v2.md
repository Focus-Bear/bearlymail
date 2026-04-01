# Plan: Two-Step Category Shortlisting (#1590) — v2 (Reworked)

> **Status:** PLANNING
> **Issue:** #1590 — Priority analysis prompt still very token heavy
> **PR:** #1593
> **Rework reason:** Jeremy's architectural feedback — the v1 implementation was structurally wrong.

## Problem

Power users with 15–30+ email categories inflate every priority analysis prompt with the full category list. The smart model (Claude/GPT-4) pays per-token for all those category descriptions on every single email, even though most emails only match 3–5 categories.

## Architecture — The Correct Two-Step Design

### Overview

```
┌─────────────────────────────────────────────────────────┐
│                    EMAIL ARRIVES                         │
│                                                         │
│  ┌─── Is it a new thread or first analysis? ──────┐     │
│  │ YES                                            │     │
│  │                                                │     │
│  │  Step 1: SHORTLIST (cheap model)               │     │
│  │  Input: email SUMMARY + all categories         │     │
│  │  Output: { "categories": ["A","B","C"] }       │     │
│  │  (3-5 candidates, NO "Other")                  │     │
│  │                                                │     │
│  │  Step 2: SMART ANALYSIS (existing prompt)      │     │
│  │  Input: full email + shortlisted categories    │     │
│  │  Output: priority scores + chosen category     │     │
│  │  (smart model can pick "Other" if none fit)    │     │
│  │                                                │     │
│  └────────────────────────────────────────────────┘     │
│                                                         │
│  ┌─── Is it a follow-up in existing thread? ──────┐     │
│  │ YES                                            │     │
│  │                                                │     │
│  │  BATCH TRIAGE (cheap model)                    │     │
│  │  Input: existing category + priority + summary │     │
│  │         + new message summary                  │     │
│  │  Output: { "needsReanalysis": true/false }     │     │
│  │  Does NOT choose new category — only flags     │     │
│  │                                                │     │
│  │  If flagged → trigger Step 1 + Step 2 above    │     │
│  │                                                │     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### What was wrong in v1

1. **No Step 2 prompt change.** The shortlist narrowed the categories but the smart prompt (`prioritise-email.md`) was never updated to receive the shortlisted subset. The existing `userContext.emailCategories` was just swapped out silently — but there was no explicit "choose from these shortlisted candidates" flow.

2. **Shortlist prompt used raw email body** instead of the email summary. Jeremy said: "no it would use the summary." The shortlist is a cheap pre-filter — it doesn't need the full email, just the summary.

3. **Shortlist prompt returned a JSON array** (`["Cat1", "Cat2"]`) instead of a JSON object. Jeremy said: "this won't work. It needs to be a JSON object."

4. **Shortlist prompt included "Other"** as a required output. Jeremy said: "I don't think it needs to return Other. The smart prompt can handle that." The shortlist's job is to narrow real categories — "Other" is the smart model's fallback.

5. **Batch prompt embedded per-email category lists.** This made the batch prompt *longer*, not shorter — defeating the purpose. Jeremy said: "I don't think it would work to include categories for each email in this batch prompt. It would make the prompt even longer."

6. **Batch prompt tried to choose categories.** Jeremy said it should "only check if the category and priority needs to change from what it was before. It shouldn't choose the new category, just flag whether it should change."

## Implementation Plan

### 1. Rewrite `category-shortlist.md` prompt

**Input:** email SUMMARY (not full body), all category names + descriptions
**Output:** JSON object (not array)

```markdown
---SYSTEM---
You are a fast email categoriser. Given a list of categories and an email summary,
return the {{topN}} most relevant categories as a JSON object.
Do NOT include "Other" — only return real categories from the list.
---SYSTEM---

**Available Categories:**
{{categories}}

**Email Summary:**
From: {{fromName}}
Subject: {{subject}}
Summary: {{summary}}

Return a JSON object with a "categories" array containing the {{topN}} most relevant
category names from the list above, ordered by relevance.

{"categories": ["Most Relevant Category", "Second Most Relevant", ...]}
```

Key changes from v1:
- Uses `{{summary}}` not `{{bodyPreview}}`
- Output is `{ "categories": [...] }` (JSON object), not bare array
- No mention of "Other"

### 2. Update `CategoryShortlistService.getShortlist()`

**Changes:**
- Accept `summary: string` instead of `body: string` in the email input
- Pass `summary` to the prompt template as `{{summary}}`
- Remove `cleanEmailContent` / `BODY_PREVIEW_LENGTHS.SHORTLIST_PREVIEW` — the caller provides the pre-computed summary
- Update `parseShortlistResponse()` to extract from `{ "categories": [...] }` JSON object instead of bare array
- Remove the "always append Other" logic — smart prompt handles that

**Method signature change:**
```typescript
async getShortlist(
  email: {
    from: string;
    fromName?: string;
    subject: string;
    summary: string;  // <-- was `body: string`
  },
  allCategories: CategoryItem[],
  topN?: number,
): Promise<CategoryItem[]>
```

### 3. Update `PriorityAnalysisService.buildPriorityPrompt()` (single email)

**Changes:**
- When shortlisting is enabled and category count exceeds threshold:
  1. Call `categoryShortlistService.getShortlist()` with the email's **summary** (which is already available or computed from the cleaned body)
  2. Pass the shortlisted categories into `buildUserContextTexts()` as the effective category list
  3. The existing `prioritise-email.md` prompt already handles "Other" as a fallback — no prompt changes needed
- The smart prompt receives fewer categories → fewer tokens → cheaper

### 4. Rework batch analysis — DO NOT embed per-email categories

**The batch prompt (`buildBatchPriorityPrompt`) changes:**
- **Remove** all per-email shortlisting logic (the `Promise.all` + per-email `getShortlist` calls)
- **Remove** per-email category list embedding in email descriptions
- The batch prompt continues to use the shared category list (no per-email customization)
- But critically: the batch prompt's role in the new architecture is **triage only** for follow-up messages (see next section)

### 5. Clarify batch vs individual analysis flow

The existing `incremental-priority-check.md` prompt already does most of what Jeremy described for batch triage: it checks whether a follow-up message needs full reanalysis. The key insight from Jeremy:

> "Batch prompt can only be used to check if the category and priority needs to change from what it was before. It shouldn't choose the new category, just flag whether it should change. If it does change, it would trigger individual analysis."

**This means:**
- The `analyzePriorityBatch()` method should be the **triage** step — it checks if category/priority needs changing
- If flagged for change → call `analyzePriority()` individually (which now uses Step 1 shortlist + Step 2 smart analysis)
- The batch prompt should be lightweight: include email summaries + existing category/priority, ask only "does this need to change?"

**Implementation approach:**
- `buildBatchPriorityPrompt()` should be refactored to produce a triage-style prompt:
  - For each email: include summary, existing category, existing priority score
  - Ask: "For each email, does the category or priority need to change? Return `{ "results": [{ "key": "...", "needsReanalysis": true/false, "reason": "..." }] }`"
- `analyzePriorityBatch()` then processes the triage results:
  - Emails flagged `needsReanalysis: true` → call `analyzePriority()` individually (goes through shortlist → smart analysis)
  - Emails flagged `needsReanalysis: false` → keep existing category/priority

**Note:** This is a significant refactor of the batch flow. The current batch prompt tries to do full analysis (urgency scores, category selection, goal alignment) for all emails at once. The new design makes it a cheap triage-only step.

### 6. Create a new batch triage prompt template

New file: `server/promptfoo/prompts/batch-priority-triage.md`

This replaces the batch usage of `prioritise-email.md`. The triage prompt:
- Receives: list of emails with their current category + priority + summary
- Returns: which emails need full reanalysis
- Does NOT: choose new categories, compute scores, or do any deep analysis

```markdown
---SYSTEM---
You are an email triage assistant. For each email, determine whether its existing
category and priority need to be re-evaluated based on the current summary.
Do NOT choose new categories or scores — only flag which emails need reanalysis.
---SYSTEM---

**Emails to triage:**
{{emailList}}

For each email, return whether it needs full reanalysis.
Return a JSON object:
{
  "results": [
    { "key": "email-key-1", "needsReanalysis": true, "reason": "topic shifted from support to billing" },
    { "key": "email-key-2", "needsReanalysis": false, "reason": "routine follow-up, same topic" }
  ]
}
```

### 7. Update tests

- `category-shortlist.service.spec.ts`: Update to test `summary` input instead of `body`, JSON object output parsing, no "Other" appending
- `priority-analysis.service.spec.ts`: Update batch tests to verify triage-only flow (no per-email category embedding), individual fallback on `needsReanalysis: true`
- Add integration test: full flow from shortlist → smart analysis with reduced category list

### 8. Update `.env.example`

`ENABLE_CATEGORY_SHORTLIST` feature flag has been removed — shortlisting is always active when category count exceeds the threshold. `CATEGORY_SHORTLIST_MODEL` defaults to `gpt-5.4-nano` in code; no CDK env var needed unless overriding.

## Files to modify

| File | Change |
|------|--------|
| `server/promptfoo/prompts/category-shortlist.md` | Rewrite: summary input, JSON object output, no "Other" |
| `server/promptfoo/prompts/batch-priority-triage.md` | **NEW**: lightweight triage-only prompt for batch |
| `server/src/llm/category-shortlist.service.ts` | Accept summary, parse JSON object, remove "Other" append |
| `server/src/llm/category-shortlist.service.spec.ts` | Update tests for new interface |
| `server/src/llm/priority-analysis.service.ts` | Refactor batch to triage-only, individual analysis uses shortlist |
| `server/src/llm/priority-analysis.service.spec.ts` | Update batch tests |
| `server/src/llm/prompts.ts` | Register `batch_priority_triage` prompt |
| `server/src/llm/llm-operations.ts` | Add `LLM_OP_BATCH_TRIAGE` operation |

## Token savings estimate

- **Single email analysis:** ~18-33% fewer tokens (same as v1 estimate — shortlisting still works the same for individual emails)
- **Batch analysis:** Potentially MORE savings since the triage prompt is much smaller than the full analysis prompt. Emails that don't need reanalysis skip the expensive smart model entirely.
- **Trade-off:** Emails flagged for reanalysis pay for two calls (triage + individual analysis), but this should be a minority of batch emails.

## Out of scope

- Changing the `prioritise-email.md` smart prompt itself (it already handles "Other" correctly)
- Changing the `incremental-priority-check.md` prompt (it's for thread follow-ups, not batch)
- Any client-side changes
