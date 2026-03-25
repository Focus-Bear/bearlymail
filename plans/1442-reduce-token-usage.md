# Plan: Reduce Token Usage for Email Prioritisation (#1442)

## Problem

Token usage for email prioritisation is extremely high. The root cause is **the prompt template itself** — at ~18KB (~4,500 tokens) of static instructions, every single prioritisation call burns thousands of input tokens on the same unchanging rules, regardless of whether it's a single email or a batch of 5.

### Root Cause Analysis

**Finding 1: The prompt template is massive (~18KB / ~4,500 tokens)**

`server/promptfoo/prompts/prioritise-email.md` is 18,147 bytes. It contains:
- Extensive category selection rules (Step 1, 2, 2a, 3) with detailed examples
- QA pass/fail detection heuristics
- Devin PR identification rules  
- Multi-language awareness instructions
- Boilerplate footer ignore rules
- Newsletter scoring rules
- Subject line urgency signal rules
- 10 numbered "IMPORTANT RULES"
- Repeated JSON format specifications (once at top, once at bottom)

This prompt is sent **in full** for every single LLM call, even for individual emails.

**Finding 2: Batch mode IS being used (partially)**

The batching infrastructure exists and works:
- `email-lifecycle.service.ts` buffers emails (max 5, flush after 2s)
- When buffer has >1 email → `REFINE_PRIORITY_BATCH` job
- When buffer has exactly 1 email → falls back to individual `REFINE_PRIORITY` job

However, the **same bloated prompt** is used for both paths — batch mode just adds the emails to the end of the same ~18KB template.

**Finding 3: Email body content is already well-managed**

The code already uses summaries when available (`email.summary?.trim() ? email.summary : cleanEmailContent(...)`) and caps body content at 1,000 chars (single) or 500 chars (batch). This is NOT the problem — the email content is compact. The prompt instructions are what's expensive.

**Finding 4: Single-email path still exists and is frequently hit**

When only 1 email arrives (common for trickle-in emails), it bypasses batch mode entirely and runs through `handleRefinePriorityJob` → `runFullPriorityRefinement` → `analyzePriority`, which uses the full prompt for just one email. Other callers (admin recalculate, debug, controller endpoints) also use the single-email path.

**Finding 5: `maxTokens` for output is reasonable**

- Single: 2,000 tokens (`LLM_MAX_TOKENS_MEDIUM`)
- Batch: 200 × N tokens (`LLM_MAX_TOKENS_EXPLANATION × emailCount`)

Output tokens aren't the main issue — it's the input prompt that dominates.

## Solution

### Phase 1: Compress the prompt template (HIGH IMPACT, LOW RISK)

**Target: Reduce prompt from ~4,500 tokens to ~1,500 tokens (~67% reduction)**

The current prompt is written in a verbose, tutorial-like style with many examples and edge cases spelled out in natural language. It can be dramatically compressed while preserving all the rules:

1. **Extract repeated JSON format specs** — the format is defined twice (top + bottom). Define once.
2. **Compress category selection rules** — Steps 1/2/2a/3 with examples can be condensed to a terse numbered list. The detailed Devin PR example, QA pass/fail heuristics, and multi-language awareness can be expressed in ~30% of current words.
3. **Remove redundant phrasing** — phrases like "IMPORTANT RULES", "CRITICAL", "ABSOLUTE RULE" appear repeatedly. Use a single terse rules block.
4. **Use shorthand for scale descriptions** — "0-30: Low urgency, can wait" → keep the range, drop the English description (the LLM knows what 0-30 means for urgency).
5. **Remove the "10 IMPORTANT RULES" section** — most repeat what's already said above. Deduplicate.

#### Files to modify:
- `server/promptfoo/prompts/prioritise-email.md` — rewrite to compressed version

#### Validation:
- Run existing promptfoo tests: `npm run test:promptfoo` (or equivalent) to verify category accuracy, urgency scoring, and goal alignment haven't regressed
- Compare before/after token counts using tiktoken or the LLM's reported usage

### Phase 2: Use system prompt for static instructions (MEDIUM IMPACT, LOW RISK)

The `buildPriorityPrompt` method already returns a `{ prompt, systemPrompt }` tuple, but the prompt config's `systemPrompt` appears to be empty or minimal. Move the static rules to `systemPrompt` and keep only the dynamic context + email content in the user prompt.

**Why this helps:** Many LLM providers cache system prompts across calls. If the system prompt is identical across calls (which it would be — the rules don't change), providers like Anthropic (prompt caching) and OpenAI (automatic caching) can serve cached input tokens at 90% discount.

#### Files to modify:
- `server/promptfoo/prompts/prioritise-email.md` — split into system portion (rules) and user portion (dynamic context + email)
- `server/src/llm/prompts.ts` — ensure `systemPrompt` field from prompt config is used correctly
- `server/src/llm/priority-analysis.service.ts` — verify `systemPrompt` is passed through to LLM call for both single and batch paths

### Phase 3: Increase batch size and reduce single-email fallback (MEDIUM IMPACT, LOW RISK)

Currently:
- `BATCH_MAX_SIZE = 5` (max emails per batch)
- `BATCH_FLUSH_DELAY_MS = 2000` (2 second window)
- Single emails skip batching entirely

Proposed changes:
- Increase `BATCH_MAX_SIZE` to 10 (amortize the prompt across more emails)
- Increase `BATCH_FLUSH_DELAY_MS` to 5000 (5 seconds — gives more time to collect emails during sync)
- These are configurable constants, easy to tune

With Phase 1 + Phase 3, a batch of 10 emails would use ~1,500 prompt tokens + ~500 tokens per email body = ~6,500 total, vs current ~4,500 + ~1,000 per email × 10 separate calls = ~55,000 tokens. That's an **~88% reduction**.

#### Files to modify:
- `server/src/emails/email-lifecycle.service.ts` — update `BATCH_MAX_SIZE` and `BATCH_FLUSH_DELAY_MS` constants

## Implementation Order

1. **Phase 1** first — immediate, measurable token reduction on every call
2. **Phase 2** second — enables provider-level caching for remaining prompt tokens
3. **Phase 3** third — maximizes amortization of prompt cost across emails

## Estimated Token Savings

| Scenario | Current (est.) | After Phase 1 | After All Phases |
|----------|---------------|---------------|-----------------|
| 1 email (single path) | ~5,500 input | ~2,500 input | ~2,500 (cached system) |
| 5 emails (batch) | ~7,500 input | ~4,000 input | ~4,000 (cached system) |
| 10 emails (batch, Phase 3) | N/A (max 5) | ~6,500 input | ~6,500 (cached system) |
| 10 emails (current, 2 batches) | ~15,000 input | ~8,000 input | ~8,000 (cached system) |

## Risk Assessment

- **Phase 1 (prompt compression):** Low risk — promptfoo tests validate output quality. The same rules are expressed, just more concisely. LLMs handle terse instructions well.
- **Phase 2 (system prompt split):** Low risk — architectural change, no logic change. Verify provider compatibility.
- **Phase 3 (batch tuning):** Low risk — only changes timing/size constants. Slightly increases latency for first email in batch (2s → 5s) but this is background processing, not user-facing.

## Out of Scope

- Changing the priority scoring algorithm itself
- Changing which emails get prioritised
- Modifying the incremental analysis path (already optimised)
- Switching LLM providers or models

---

*Plan by Monk of Modularity 🧘 for issue #1442*
