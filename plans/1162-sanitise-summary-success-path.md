# Plan: #1162 — parseSummaryWithPhishing success path doesn't sanitise summary field

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1162
> **Branch:** `plan/issue-1162-sanitise-summary`

---

## Problem Analysis

In `server/src/llm/llm.service.ts`, the `parseSummaryWithPhishing` method has a success path that does NOT call `extractPlainSummary` on the parsed `summary` field. This means if a custom `howToSummarize` rule causes the LLM to embed JSON within the `summary` field of the structured response, that raw JSON string gets stored in the DB.

The client-side guard added in PR #1158 catches this at display time, but the DB record remains dirty.

---

## Root Cause

### Current code (`server/src/llm/llm.service.ts:583–625`)

```typescript
private parseSummaryWithPhishing(response: string): {
  summary: string;
  ...
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.summary === 'string') {
        const sentiment = this.validateSentimentResult(parsed.sentiment);
        const category = typeof parsed.category === 'string' ? parsed.category : null;
        const categoryExplanation = typeof parsed.categoryExplanation === 'string'
          ? parsed.categoryExplanation : null;
        return {
          summary: parsed.summary.trim(),  // ← BUG: no extractPlainSummary call
          phishing: this.validatePhishingLLMResult(parsed.phishing),
          sentiment,
          category,
          categoryExplanation,
        };
      }
    }
  } catch {
    // fall through
  }
  return {
    summary: extractPlainSummary(response),  // ← fallback path DOES sanitise
    ...
  };
}
```

The fallback path (when JSON parse fails) calls `extractPlainSummary(response)` ✅  
The success path (when JSON parse succeeds) returns `parsed.summary.trim()` without sanitising ❌

### `extractPlainSummary` (lines 79–101)

This function:

- If input is plain text, returns it as-is
- If input contains JSON (as a string), extracts the readable content
- Handles nested JSON structures (arrays, objects) and converts to human-readable text

So calling it on `parsed.summary` is safe even for clean summaries — it's a no-op for plain text.

---

## Fix

**One-line change** in `parseSummaryWithPhishing` success branch:

```typescript
// Before:
summary: parsed.summary.trim(),

// After:
summary: extractPlainSummary(parsed.summary),
```

Note: `extractPlainSummary` already trims internally — the `.trim()` can be removed or left in place. Verify by reading `extractPlainSummary` implementation (line 79).

---

## Files to Modify

| File                                 | Change                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `server/src/llm/llm.service.ts`      | Line ~612: replace `parsed.summary.trim()` with `extractPlainSummary(parsed.summary)`                                         |
| `server/src/llm/llm.service.spec.ts` | Add test: when LLM returns structured JSON with JSON string in `summary` field, `parseSummaryWithPhishing` returns clean text |

---

## Test Case to Add

```typescript
it("sanitises summary in the success path when LLM embeds JSON in summary field", () => {
  // Simulate LLM returning a structured response where summary is itself a JSON string
  const response = JSON.stringify({
    summary: '{"key": "some embedded JSON value"}',
    phishing: null,
    sentiment: { score: 0.1, explanation: "neutral" },
    category: "Work",
    categoryExplanation: null,
  });
  const result = service.callParseSummaryWithPhishing(response);
  // Should NOT return raw JSON string
  expect(result.summary).not.toContain("{");
  expect(result.summary).not.toContain("}");
});
```

Note: `parseSummaryWithPhishing` is `private`. Either:

1. Use `(service as any).parseSummaryWithPhishing(response)` in the test, OR
2. Test via a public method that calls it (e.g., by mocking `callLLM` to return the JSON response and calling `summarizeEmail`)

---

## Scope

This is a minimal, low-risk fix:

- **One line changed** in `llm.service.ts`
- **One test added** in `llm.service.spec.ts`
- No DB migration needed (dirty records remain; client-side guard in #1158 continues to protect the display layer)

If we want to clean up existing dirty records, that's a separate backfill task and should be tracked as a new issue.

---

## Implementation Notes

1. Read `extractPlainSummary` at line 79 to confirm it handles `undefined`/`null` gracefully before calling it with `parsed.summary` (which is already validated as `typeof === 'string'`, so this is safe).
2. The function signature of `extractPlainSummary` is `(value: string): string` — takes a string, returns a string. No changes needed to callers.
3. This is a pure logic fix with no side effects on other code paths.
