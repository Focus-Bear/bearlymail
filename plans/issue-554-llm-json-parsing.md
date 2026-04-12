# Plan: LLM Batch Priority Response JSON Parsing (Fixes #554)

> **Branch:** `fix/issue-554-llm-json-parsing`
> **Author:** Monk of Modularity
> **Issue:** [#554 — Batch analysis is still failing often](https://github.com/Focus-Bear/BearlyMail/issues/554)

---

## Root Cause

**File:** `server/src/llm/priority-analysis.service.ts` — `analyzePriorityBatch()`
**Supporting file:** `server/src/llm/llm-core.service.ts`

### Why the LLM can never return a bare array

The batch priority call uses `jsonMode: true`. Tracing that flag through `llm-core.service.ts`:

| Provider path                         | API parameter set                           |
| ------------------------------------- | ------------------------------------------- |
| OpenAI standard (`chat.completions`)  | `response_format: { type: "json_object" }`  |
| OpenAI reasoning (`responses.create`) | `text: { format: { type: "json_object" } }` |
| Gemini (`generateContent`)            | `responseMimeType: "application/json"`      |

**OpenAI's `json_object` response type contractually prohibits returning a bare JSON array.** The model is forced to return a JSON object at the top level — always. It cannot emit `[...]` as the root.

Because the prompt only says `"Return ONLY the JSON array"` with no specified wrapper key, the LLM invents one to satisfy the API constraint. The wrapper key is **non-deterministic** — observed values include `"array"` and `"results"` — because we haven't told it what key to use.

The current parser does:

```ts
const jsonMatch = response.match(/\[[\s\S]*\]/);
```

This works incidentally when the inner array spans multiple lines and the regex can extract it. It is fragile and treats a symptom rather than the cause. The real fix is to specify the wrapper key explicitly in the prompt and parse by key.

**Gemini note:** `responseMimeType: "application/json"` does allow bare arrays. However, since both providers share a single prompt and can fall back to each other, the prompt must be compatible with both. Standardising on a named wrapper object is the safe cross-provider choice.

### No JSON schema support currently

`LLMRequest` (in `llm.types.ts`) has no `jsonSchema` field. Neither provider path passes a structured schema today. This is a future enhancement opportunity noted below.

---

## The Correct Fix

### Fix 1 — Define a consistent wrapper key in the prompt

**Location:** `priority-analysis.service.ts`, the `batchPrompt` const (lines ~486–511).

**Replace the closing format instructions:**

**Before:**

```
Return a JSON array with one object per email, in the same order as the emails above. Each object must include the email's "key" field matching the emailKey.
Example: [{"key": "email-1", "urgencyScore": 30, ...}]

IMPORTANT: Return ONLY the JSON array, no other text.
```

**After:**

```
Respond with a JSON object in exactly this shape — no other keys, no other text:
{
  "priority_results": [
    {
      "key": "email-1",
      "urgencyScore": 30,
      "urgencyExplanation": "Brief explanation",
      "sentimentScore": 0.1,
      "goalAlignmentScore": 50,
      "goalAlignmentExplanation": "Brief explanation",
      "category": "Newsletters",
      "categoryExplanation": "Brief explanation",
      "reasoning": "Brief analysis"
    },
    {
      "key": "email-2",
      "urgencyScore": 85,
      "urgencyExplanation": "Client deadline tomorrow",
      "sentimentScore": -0.2,
      "goalAlignmentScore": 90,
      "goalAlignmentExplanation": "Direct project work",
      "category": "Client Work",
      "categoryExplanation": "Client communication",
      "reasoning": "Requires immediate response"
    }
  ]
}

IMPORTANT RULES:
- The top-level key MUST be exactly "priority_results".
- "priority_results" MUST be an array with one object per email, in the same order as the emails above.
- Each object MUST include the "key" field matching the email's emailKey.
- Do NOT add any extra top-level keys.
- Do NOT wrap in markdown code fences.
```

**Why `priority_results`:** Specific, unambiguous, self-documenting, and unlikely to clash with any per-email field name.

**Why the multi-item example matters:** A concrete two-item example showing the full object shape leaves no room for the LLM to invent a different structure.

---

### Fix 2 — Update the parser to extract `.priority_results`

**Location:** `priority-analysis.service.ts`, the response-parsing block starting at line ~527.

**Current code:**

```ts
const batchResponsePreview = response.substring(0, QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH);
const jsonMatch = response.match(/\[[\s\S]*\]/);
if (jsonMatch) {
  const parsed = JSON.parse(jsonMatch[0]);
  if (Array.isArray(parsed)) {
    for (const item of parsed) { ... }
  }
} else {
  // error logging
}
```

**Replace with:**

```ts
const batchResponsePreview = response.substring(
  0,
  QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
);

let parsedArray: unknown[] | null = null;
try {
  const parsed: unknown = JSON.parse(response);

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;

    // Primary path: well-formed response using the expected wrapper key
    if (Array.isArray(obj["priority_results"])) {
      parsedArray = obj["priority_results"] as unknown[];
    } else {
      // Defensive fallback: LLM used the wrong wrapper key.
      // Extract the first array-valued property found.
      // Handles {"array":[...]}, {"results":[...]}, and any other invented key.
      const firstArrayValue = Object.values(obj).find((v) => Array.isArray(v));
      if (firstArrayValue !== undefined) {
        this.logger.warn(
          `analyzePriorityBatch: LLM used wrong wrapper key. ` +
            `Expected "priority_results", got [${Object.keys(obj).join(", ")}]. ` +
            `Extracting first array-valued property as fallback. ` +
            `Check for model drift or prompt regression.`,
        );
        parsedArray = firstArrayValue as unknown[];
      }
    }
  } else if (Array.isArray(parsed)) {
    // Gemini with responseMimeType may legitimately return a bare array
    parsedArray = parsed as unknown[];
  }
} catch {
  // JSON.parse failed entirely — fall through to error branch below
}

if (parsedArray !== null) {
  for (const item of parsedArray) {
    const typedItem = item as Record<string, unknown>;
    const key = typedItem["key"] || typedItem["emailKey"];
    if (key) {
      // ... same result-mapping logic as before (no changes needed here)
    }
  }
} else {
  // No usable array found — existing error logging unchanged
  const emailKeys = emails.map((e) => e.emailKey).join(", ");
  this.logger.error(
    `analyzePriorityBatch: LLM returned a non-parseable response for batch of ${emails.length} emails [${emailKeys}]. Response preview: "${batchResponsePreview}"`,
  );
  this.errorTrackingService.captureException(
    new Error(
      `LLM batch priority response contained no JSON array. Response preview: ${batchResponsePreview}`,
    ),
    userId,
    {
      operation: "analyze_priority_batch",
      emailCount: emails.length,
      emailKeys,
      responsePreview: batchResponsePreview,
    },
  );
}
```

**Key design decisions:**

| Decision                                                | Reason                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `JSON.parse(response)` directly, not regex              | The full response is valid JSON (guaranteed by `json_object` mode on OpenAI); no fragile regex needed |
| Primary path checks `priority_results`                  | Matches the new prompt; explicit and fast                                                             |
| Defensive fallback extracts first array-valued property | Catches model drift or wrong-key responses without hard crash; emits `warn` to stay visible           |
| Bare-array guard                                        | Gemini with `responseMimeType` can legitimately return a bare array                                   |
| `warn` on fallback, not `error`                         | Fallback is recovery, not failure; `error` stays reserved for total parse failure                     |

---

## Future Enhancement: JSON Schema Enforcement

`LLMRequest` currently has no `jsonSchema` field. OpenAI supports `response_format: { type: "json_schema", json_schema: { name: "...", schema: {...}, strict: true } }` which would allow the API itself to validate and enforce the response shape. Gemini supports a similar `responseSchema` field.

**Recommended follow-up:**

1. Add optional `jsonSchema?: object` to `LLMRequest` in `llm.types.ts`
2. In `generateWithOpenAIStandardModel`: if `jsonSchema` is set, use `json_schema` response type instead of `json_object`
3. Pass the schema from `analyzePriorityBatch` for API-level shape enforcement, removing all ambiguity

This eliminates even the need for the defensive fallback long-term.

---

## Similar Vulnerabilities in the Codebase

The same regex-based extraction pattern (`response.match(/\[[\s\S]*\]/)`) appears in other parsers that also use `jsonMode: true`. Under `json_object` mode, these have the same root cause — no named wrapper key — and risk the same silent failures.

### `llm.service.ts` — Q&A Extraction (line ~1365)

```ts
const jsonMatch = response.match(/\[[\s\S]*\]/);
if (jsonMatch) {
  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed) ? parsed.filter(...) : [];
}
```

**Risk: Medium.** Wrong wrapper key → regex may fail → silently returns `[]`. Token cost is wasted, Q&A data is lost.

### `llm.service.ts` — Category Consolidation (line ~2003)

```ts
const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
if (!jsonMatch) {
  this.logger.warn(`[CATEGORY-CONSOLIDATION] No JSON array found in response`);
  return null;
}
```

**Risk: Medium.** Wrong wrapper key → category consolidation returns null → user-visible category regression.

### `email-search-ranking.service.ts` — Query Expansion (line ~139)

```ts
const jsonMatch = response.match(/\[[\s\S]*\]/);
if (jsonMatch) {
  const queries: unknown = JSON.parse(jsonMatch[0]);
```

**Risk: Low.** Affects search quality; degrades gracefully with no hard failure.

**Recommendation:** Each of these callers should define their own named wrapper key in the prompt and parse by key directly. The fix is mechanical but per-caller — each has a different response shape and prompt context. Track as a follow-up ticket.

---

## Implementation Order

1. **Update `batchPrompt`** in `priority-analysis.service.ts` — add `priority_results` wrapper key, explicit format rules, two-item example.
2. **Update the parser** in `analyzePriorityBatch()` — use `JSON.parse(response)` directly, extract `.priority_results`, add wrong-key fallback with `warn`, add bare-array guard for Gemini.
3. **Update unit tests** in `priority-analysis.service.spec.ts`:
   - ✅ `{"priority_results": [...]}` → parses correctly (happy path)
   - ✅ `{"results": [...]}` → fallback fires, `warn` logged, results populated
   - ✅ `{"array": [...]}` → fallback fires, `warn` logged, results populated
   - ✅ Gemini bare array `[...]` → bare-array guard fires, results populated
   - ✅ `{}` (empty object, no array values) → `parsedArray` is null, error logged, `captureException` called
   - ✅ Garbage / non-JSON string → `JSON.parse` throws, `parsedArray` is null, error logged
   - ✅ Existing test (line ~328): `jsonMode: true` is still passed — no change needed
4. **Follow-up ticket:** Apply the named-wrapper-key fix to Q&A extraction and category consolidation in `llm.service.ts`, and query expansion in `email-search-ranking.service.ts`.
5. **Follow-up ticket:** Add `jsonSchema` to `LLMRequest` and pass a schema for `priority_results` to enable API-level shape enforcement.

---

## Out of Scope for This PR

- JSON schema enforcement via API (`LLMRequest.jsonSchema` field) — tracked as follow-up.
- Fixing the three secondary parsers — tracked as follow-up.
- Changes to single-email priority analysis — not affected by this bug.
- Changing the provider fallback logic — separate concern.
