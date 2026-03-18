# Plan: Fix TL;DR Showing Raw JSON from Custom Summarisation Rule (#1156)

## Summary

When a user has a custom summarisation rule whose `howToSummarize` prompt instructs the
LLM to return structured/JSON output (e.g. `{ "title": "...", "status": "..." }`), the
UI can display raw JSON string rather than human-readable text.

There are **two separate code paths** where this can occur, each with its own fix.

---

## Root Cause Analysis

### Path A — Background auto-summarisation (llm-processor → summarizeEmailWithAutoRule)

**Flow:**
1. `llm-processor.ts` → `summarizationService.summarizeEmailWithAutoRule()`
2. Custom rule matched → `rule = { type: 'custom', customPrompt: howToSummarize }`
3. → `summarizeEmailWithPhishing()` → `summarizeEmailWithCombinedPhishing()`
4. → `llmService.summarizeCustomPromptWithPhishing()` (in `server/src/llm/llm.service.ts` line 592)
5. The phishing footer is appended to the custom prompt instructing the LLM to return:
   ```json
   { "summary": "...", "phishing": ..., "sentiment": ..., "category": ... }
   ```
6. `parseSummaryWithPhishing()` extracts `parsed.summary` and returns it.

**Problem in Path A:**
If the user's `howToSummarize` **also** contains JSON output instructions (e.g. "return JSON
with fields title, status, pr_count"), the LLM can become confused by the two competing
schemas. In this case the LLM may:
  - Return the user's JSON schema → `parsed.summary` is undefined → falls back to
    `response.trim()` (the raw JSON string) stored as summary.
  - Or merge both schemas → `summary` field holds the serialised inner JSON string.

The fallback in `parseSummaryWithPhishing()` is:
```ts
return {
  summary: response.trim(),  // ← raw JSON string stored here
  phishing: null,
  ...
};
```

### Path B — Batch summarisation (summarizeThreadBatch → processBatchRuleGroup → summarizeThreads → summarizeSingleThread)

**Flow (single-thread case):**
1. `summarizeThreadBatch()` → `processBatchRuleGroup()` → `llmService.summarizeThreads()`
2. For 1 thread with `customInstructions`: calls `summarizeSingleThread(thread, …, customInstructions)`
3. `summarizeSingleThread` with custom instructions calls `llmService.generateText()` **directly**
   — no JSON wrapper, no phishing footer.
4. If the user's `howToSummarize` says "return JSON { … }", the raw JSON string is returned
   and stored verbatim.

> Note: `summarizeThreadBatch` has no callers today (defined but unused), but the
> `summarizeSingleThread` path through `summarizeThreads` is also reachable from
> `processBatchRuleGroup` for single-thread groups.

### Path C — On-demand summarisation via UI (handleUseCustomRule → POST /summarize/:id)

**Flow:**
1. `handleUseCustomRule` in `useEmailDetailOperations.ts` (line 281) POSTs
   `{ type: 'custom', customPrompt: rule.howToSummarize }` to `POST /summarize/:id`.
2. Controller calls `summarizationService.summarizeEmailWithPhishing()` with `type: 'custom'`.
3. Same as Path A: goes through `summarizeCustomPromptWithPhishing()` → phishing footer appended.
4. `parseSummaryWithPhishing()` extracts `parsed.summary`.

**Path C has the same vulnerability as Path A** — conflicting JSON schema in the user prompt.

### UI Rendering (no JSON parsing)

`SummarySection.tsx` renders `{summary}` directly as a string (line ~130 in the component).
`EmailCardBody.tsx` also renders `{summary}` raw. Neither component attempts `JSON.parse`
or structured rendering — they just display whatever string is in the `summary` field.

This means the fix must be **server-side**: ensure the string stored/returned as `summary`
is always plain human-readable text, never a raw JSON blob.

---

## Identified Bug Scenarios

### Bug 1: Custom prompt instructs JSON output → LLM ignores `summary` key
A user creates a rule: `howToSummarize: "Return JSON: { title, pr_count, status }"`.
The appended phishing footer asks for `{ summary, phishing, ... }`.
The LLM returns the user's schema without a `summary` field.
`parseSummaryWithPhishing` falls through to `response.trim()` → raw JSON stored.

### Bug 2: Custom prompt instructs JSON output → `summary` key contains inner JSON
Same scenario, but the LLM tries to "merge" both schemas, putting the user's
structured JSON inside `summary`: `{ "summary": "{\"title\": \"...\", \"pr_count\": 3}" }`.
Result: `summary` is a JSON-encoded string → UI renders `{"title": "...", "pr_count": 3}`.

### Bug 3: summarizeSingleThread with customInstructions — no JSON parsing at all
`summarizeSingleThread` with a custom prompt calls raw `generateText()`. If the user
prompt requests JSON, the raw JSON is stored directly. *(Less common path today.)*

---

## Proposed Fixes

### Fix 1 — Harden `parseSummaryWithPhishing` (server/src/llm/llm.service.ts)

In `parseSummaryWithPhishing`, after extracting `parsed.summary`, add a guard to detect
and unwrap cases where `summary` is itself a JSON string:

```ts
private extractPlainSummary(raw: string): string {
  // If the "summary" value is itself a JSON string, try to extract a readable field.
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const inner = JSON.parse(trimmed);
      // Common fields a GitHub/code summary rule might use:
      if (typeof inner?.summary === 'string') return inner.summary.trim();
      if (typeof inner?.title === 'string') return inner.title.trim();
      if (typeof inner?.description === 'string') return inner.description.trim();
      if (typeof inner?.text === 'string') return inner.text.trim();
      // Fallback: serialise as readable key: value lines
      return Object.entries(inner)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } catch {
      // not valid JSON — return as-is
    }
  }
  return trimmed;
}
```

Then in `parseSummaryWithPhishing`:
```ts
if (typeof parsed.summary === 'string') {
  return {
    summary: this.extractPlainSummary(parsed.summary.trim()),
    ...
  };
}
```

And in the fallback branch:
```ts
return {
  summary: this.extractPlainSummary(response.trim()),
  ...
};
```

### Fix 2 — Harden `summarizeCustomPromptWithPhishing` prompt construction

When the `customPrompt` looks like it contains JSON output instructions (simple heuristic:
contains `"return json"` or `"return a json"` case-insensitively), prepend a clarifying
system note that the `summary` field must always be a plain-text string:

```ts
const jsonOutputWarning = /return\s+(a\s+)?json/i.test(customPrompt)
  ? `IMPORTANT: Your "summary" field in the final JSON response must always be a plain-text string, never a JSON object or code block.\n\n`
  : '';

const fullPrompt = `${bodyPreamble}${jsonOutputWarning}${customPrompt}\n\n${phishingFooter}${phishingSignalsText}`;
```

### Fix 3 — Fix `summarizeSingleThread` custom path to parse JSON response

In `summarizeSingleThread` (server/src/llm/llm.service.ts ~line 695), when
`customInstructions` is set, the raw `generateText()` result is returned.
Wrap with the same `extractPlainSummary` helper:

```ts
if (customInstructions) {
  // ...existing prompt building...
  const rawSummary = await this.generateText(...);
  summary = this.extractPlainSummary(rawSummary);
}
```

### Fix 4 (Optional / defensive) — UI-side JSON detection in SummarySection

As a last line of defence, in `SummarySection.tsx` detect when the summary string
looks like JSON and display a friendly fallback message:

```tsx
const displaySummary = (() => {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      // It IS valid JSON — something went wrong server-side
      return t('emailDetail.summaryJsonError', { defaultValue: 'Summary unavailable — please regenerate.' });
    } catch {
      // not JSON, fine
    }
  }
  return summary;
})();
```

This is a belt-and-suspenders measure; the server-side fixes (1-3) should prevent this.

---

## Files to Change

| File | Change |
|------|--------|
| `server/src/llm/llm.service.ts` | Add `extractPlainSummary()` helper; call it in `parseSummaryWithPhishing` (both branches) and in `summarizeSingleThread` custom path |
| `server/src/llm/llm.service.ts` | Add JSON-output warning injection in `summarizeCustomPromptWithPhishing` |
| `client/src/components/email-detail/SummarySection.tsx` | Optional: add JSON detection guard before rendering |

---

## Tests to Add / Update

### Server unit tests (`server/src/llm/llm.service.spec.ts` or new file)

1. `parseSummaryWithPhishing` — when LLM returns JSON without `summary` key → falls back cleanly
2. `parseSummaryWithPhishing` — when `summary` value is itself a JSON string → unwrapped to plain text
3. `parseSummaryWithPhishing` — when `summary` value is `{ title, status }` → readable fallback
4. `summarizeSingleThread` with custom instructions returning JSON → result is plain text
5. `summarizeCustomPromptWithPhishing` with a JSON-instructing prompt → warning injected

### E2E / integration

No new E2E tests required for this fix; the unit tests above are sufficient.

---

## Acceptance Criteria

- [ ] A user with a custom rule `howToSummarize: "Return JSON { title, pr_count }"` sees readable plain text TL;DR in email card and email detail, not raw JSON.
- [ ] Standard (non-custom) TL;DR, bullet-point, and action-items summaries are unaffected.
- [ ] Phishing, sentiment, and category data still parse correctly when the LLM returns the correct schema.
- [ ] No regressions in existing summarisation unit tests.

---

## Priority

**P1** — visible data corruption in the UI for any user with a structured custom rule.

---

*Plan authored by Monk of Modularity — openclaw/issue-1156/tldr-json-rendering-plan*
