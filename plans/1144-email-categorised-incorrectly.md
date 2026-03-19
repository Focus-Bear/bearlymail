# Plan: Fix #1144 — Email Categorised Incorrectly

**Branch:** `plan/1144-email-categorised-incorrectly`  
**Author:** Monk of Modularity (AI agent), subagent of Laoban  
**Priority:** P2 — incorrect categorization degrades user trust in the inbox  
**Linked issue:** #1144  

---

## Root Cause Analysis

Email categorization runs through two code paths that have diverged in quality:

### Path A: Single-email priority analysis (`analyzePriority`)
**File:** `server/src/llm/priority-analysis.service.ts`  
**Prompt:** `server/promptfoo/prompts/prioritise-email.md`

The single-email path uses the promptfoo template (`prioritise-email.md`) which has received extensive prompt engineering:
- **Step 1**: Identify sender type (human/bot/automated) before selecting category
- **Step 2**: Parse category names carefully, eliminate incompatible options using exclusion/source qualifiers
- **Step 3**: Select best fitting category from remaining eligible options
- GitHub-specific guidance (Devin PR identification, QA comments)
- Strong instructions: "return the category name EXACTLY as listed"

### Path B: Batch priority analysis (`analyzeBatchPriority`)  
**File:** `server/src/llm/priority-analysis.service.ts` — `analyzeBatchPriority` method (line ~497)

The batch path uses a **hardcoded inline string template** that was NOT updated when the single-email prompt was improved. The batch prompt:
- Has NO Step 1/2/3 sender-type-first categorization logic
- Has NO GitHub-specific guidance (Devin PR, QA pass/fail distinction)
- Has NO exclusion qualifier reasoning instructions
- Is a simplified version that simply says "Best fitting from: ${emailCategoriesText}, 'Other'"

**Most emails go through the batch path** (via `analyzeBatchPriority` → `llm-processor.ts` batch processing). The single-email path is only used for incremental recalculation of individual emails after batch analysis.

---

### Secondary Issue: Aggressive Prefix Matching in `canonicaliseCategoryName`

**File:** `server/src/emails/llm-processor.ts` — `canonicaliseCategoryName` (line ~1433)

```typescript
// Prefix match: LLM returned name starts with known name (or vice versa)
const prefixMatch = knownNames.find(
  (knownName) =>
    rawName.toLowerCase().startsWith(knownName.toLowerCase()) ||
    knownName.toLowerCase().startsWith(rawName.toLowerCase()),
);
if (prefixMatch) return prefixMatch;
```

This can silently misassign categories when one category name is a prefix of another.

**Example:**
- Categories: `["Build", "Build/deployment errors (other repos)"]`  
- LLM returns: `"Build/deployment errors (other repos)"`
- The `prefixMatch` finds `"Build"` first (because `"Build/deployment errors (other repos)".startsWith("Build")`)
- **Result**: Email assigned to `"Build"` instead of `"Build/deployment errors (other repos)"`

This is a silent data corruption. The exact match and parenthetical-strip steps run first (and would catch most cases), but the prefix match is still a footgun when categories have hierarchical names.

---

## Files to Change

### 1. `server/src/llm/priority-analysis.service.ts`

**Replace the inline `batchPrompt` string template with a rendered promptfoo template.**

The batch prompt should load from `server/promptfoo/prompts/prioritise-email.md` (the same file as single-email), then pack multiple emails into a structured multi-email format. This ensures the batch path stays in sync with prompt improvements.

**Current approach (problematic):**
```typescript
const batchPrompt = `You are an email prioritization assistant...
- category: Best fitting from: ${emailCategoriesText}, "Other". Use "Other" ONLY...
...`; // ~100 lines of inline string
```

**New approach:**
```typescript
// Load the single-email prompt template
const promptConfig = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
if (!promptConfig) { throw new StructuralError(...); }

// Render a batch-aware version using the same template, with multi-email context
const batchPrompt = renderPrompt(promptConfig.prompt, {
  // ... all standard context vars (urgentContext, emailCategories, etc.) ...
  // Multi-email instruction injected at start
  batchMode: true,  // ← template checks this to prepend batch header + response format
  emailBatch: emailDescriptions,  // ← list of email summaries
});
```

**Or alternatively** (simpler, avoids template changes): Extract the categorization instructions from `prioritise-email.md` into a shared `categorize-email-instructions.md` partial, and include it in both the single-email and batch prompts.

> **Decision point for Codebeard**: Option A (render single-email template in batch mode via a flag) is cleaner and ensures prompt parity automatically. Option B (extract shared partial) is less invasive but requires manual sync. Recommend Option A.

**Key steps for implementation:**

1. Add `batchMode` and `emailBatch` variables to `renderPrompt` for the batch path
2. Update `prioritise-email.md` to conditionally render a batch header when `batchMode=true`:
   ```markdown
   {% if batchMode %}
   You are analyzing MULTIPLE emails below. For each, provide all required fields.
   ...response format with priority_results array...
   {% else %}
   You are analyzing a single email below.
   ...existing single-email instructions...
   {% endif %}
   ```
3. Ensure the shared `emailCategories` context, Step 1/2/3 guidance, and GitHub-specific rules are in the common section (not inside the `{% if not batchMode %}` block)

---

### 2. `server/src/emails/llm-processor.ts`

**Fix the prefix match in `canonicaliseCategoryName` to prefer longer matches.**

```typescript
private canonicaliseCategoryName(
  rawName: string,
  knownNames: string[],
): string {
  if (!rawName || rawName === "Other") return rawName;
  
  // Exact match first (case-insensitive)
  const exact = knownNames.find(
    (knownName) => knownName.toLowerCase() === rawName.toLowerCase(),
  );
  if (exact) return exact;
  
  // Parenthetical variant: "Name (description)" → strip parens and match
  const withoutParens = rawName
    .replace(/\s*\(.*\)\s*$/, "")
    .trim()
    .toLowerCase();
  const parenMatch = knownNames.find(
    (knownName) => knownName.toLowerCase() === withoutParens,
  );
  if (parenMatch) return parenMatch;
  
  // Prefix match: collect ALL candidates, then pick the LONGEST known name that matches.
  // "Longest known name" avoids misassigning "Build/deployment errors" → "Build" when both exist.
  // ↓ CHANGED: was `find` (first match), now collects all and picks longest
  const prefixCandidates = knownNames.filter(
    (knownName) =>
      rawName.toLowerCase().startsWith(knownName.toLowerCase()) ||
      knownName.toLowerCase().startsWith(rawName.toLowerCase()),
  );
  if (prefixCandidates.length > 0) {
    // Prefer the candidate with the longest name (most specific match)
    return prefixCandidates.reduce((a, b) => (b.length > a.length ? b : a));
  }
  
  return rawName;
}
```

---

### 3. `server/promptfoo/prompts/prioritise-email.md`

Add batch mode support (conditional sections) while keeping all existing single-email instructions intact.

Add at the very top of the file (before existing content):

```markdown
{% if batchMode %}
You are an email prioritization assistant. Analyze each email below and return a JSON object wrapping an array of results.

For EACH email, provide the same fields as listed below. Return format:
```json
{
  "priority_results": [
    { "key": "email-1", "urgencyScore": ..., "categoryExplanation": ..., ... },
    ...
  ]
}
```

The following instructions apply to ALL emails in the batch:
{% else %}
You are an email prioritization assistant. Analyze the email below and return a JSON object.
{% endif %}
```

Then ensure the Step 1/2/3 categorization block and all other instructions are **outside** the `{% if %}` blocks (shared for both paths).

---

### 4. `server/promptfoo/` — Add batch categorization test cases

**New file:** `server/promptfoo/categorize-email-batch.yaml`

Add test cases that verify the batch path produces the same results as the single-email path for categories that historically produced false positives:

```yaml
description: "Email categorization accuracy — batch vs single-email parity"

# Test cases verifying batch categorization doesn't regress
tests:
  - description: "GitHub bot PR — NOT 'from humans', must go to a GitHub category"
    vars:
      batchMode: true
      emailBatch: [...]
      emailCategories: |
        - "Code reviews by human developers": PRs opened or reviewed by humans
        - "Devin PRs": Pull requests created by Devin AI
        - "GitHub bot notifications": Automated GitHub system notifications
    assert:
      - type: javascript
        value: |
          const results = output.priority_results;
          const pr = results[0];
          if (pr.category === 'Code reviews by human developers') {
            throw new Error(`Bot PR misassigned to human-only category: ${pr.categoryExplanation}`);
          }
          return true;
```

---

## Testing

- Unit test `canonicaliseCategoryName` with hierarchical category names (`"Build"` vs `"Build/deployment errors (other repos)"`)
- Run `promptfoo eval` on both `analyze-priority.yaml` and new `categorize-email-batch.yaml` — all cases must pass
- Integration test: verify a GitHub bot PR notification is NOT categorised as "Code reviews by human developers" via the batch path
- Regression test: ensure single-email path (`analyzePriority`) still passes all existing promptfoo tests after template changes

---

## Open Questions

1. Should the batch prompt always use `batchMode` in the template, or maintain a separate batch-specific prompt file (e.g., `prioritise-email-batch.md`) that imports the shared instructions? Separate file gives more flexibility for batch-specific response format. Recommend asking Jeremy before implementation.
2. The `analyzeBatchPriority` batch size is currently up to ~30 emails at once. With the more detailed prompt instructions (Step 1/2/3, GitHub guidance), will token count increase significantly? Codebeard should verify maxTokens is sufficient for the expanded prompt + N email batch.

---

Closes #1144
