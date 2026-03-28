# Plan: Fix Excessive "Other" Categorisation — Issue #1509

## Problem Summary

89 emails are categorised as "Other" despite their `categoryExplanation` (debug reason) suggesting they belong to existing categories. The debug panel shows a reason that implies a match should exist, yet the email ends up in "Other" anyway. This is confusing — if categorisation failed, it should say so clearly.

## Root Cause Analysis

After investigating the full categorisation flow, I found **three independent root causes** that together explain why emails land in "Other" with misleading debug reasons:

### Root Cause 1: Two Competing Category Assignment Paths (Summary vs Priority)

There are **two separate LLM calls** that both assign categories, and they use **completely different prompts and category lists**:

1. **Summary path** (`llm-summarization.service.ts` → `summarize-email-tldr.md`):
   - Uses a **hardcoded list of 9 generic categories**: `Newsletters, Sales & Marketing, Customer Support, HR & Admin, Finance, Partnerships, GitHub & Code, Personal, Other`
   - Does **NOT** receive the user's custom categories from `UserContext`
   - Returns `category` + `categoryExplanation` as part of the summary JSON

2. **Priority path** (`priority-analysis.service.ts` → `prioritise-email.md`):
   - Receives the **user's actual custom categories** from `UserContext` via `{{emailCategories}}`
   - Has detailed category selection rules (platform identity, sender type, proto-categories)
   - Returns `category` + `categoryExplanation` + optional `protoCategorySuggestion`

**The conflict:** The summary path runs first and writes `categoryExplanation` to the thread. Then the priority path runs and resolves the actual `categoryId`. But the `categoryExplanation` from the summary path **stays on the thread** — it was written by a prompt that didn't know about the user's custom categories.

This means:
- The debug reason (from summary) says "Chose GitHub & Code because..." (a hardcoded generic category)
- But the priority path tries to match "GitHub & Code" against the user's actual categories like "🐙 GitHub bot notifications" or "💻 PRs from humans"
- The `canonicaliseCategoryName()` function may not find a match, so it stays as-is
- Then `lookupCategoryContextId()` fails to find a UserContext with that exact name → `categoryId = null` → "Other"

### Root Cause 2: Summary Path Only Updates `categoryId` on Exact Full-Category Match

In `llm-summary-processor.service.ts` → `persistSingleSummaryResult()`:

```typescript
if (category && category !== "Other") {
  const matched = await this.protoCategoriesService.findMatchingFullCategory(
    jobEntry.userId,
    category,
  );
  if (matched) {
    matchedCategoryId = matched.contextId;
  }
}
await this.emailThreadRepository.update(
  { id: email.emailThreadId },
  {
    ...(matchedCategoryId !== null ? { categoryId: matchedCategoryId } : {}),
  },
);
```

If the summary LLM returns a generic category name (e.g., "GitHub & Code") that doesn't exactly match any `UserContext.EMAIL_CATEGORY` name, `matchedCategoryId` stays null and **`categoryId` is never set**. The thread remains in "Other" (null categoryId = Other since #1293).

But `categoryExplanation` IS written regardless — creating the mismatch the user sees.

### Root Cause 3: Priority Path Doesn't Always Run After Summary

The priority path has an incremental analysis optimisation (`tryIncrementalAnalysis`) that can **skip the full priority refinement** for existing threads with minor updates. When this happens:
- Summary path writes a generic `categoryExplanation`
- Priority path never runs its category resolution logic
- Thread stays with `categoryId = null` + a misleading `categoryExplanation`

## Fix Approach

### Fix A: Make Summary Path Aware of User Categories (PRIMARY FIX)

**File:** `server/src/summarization/summarization.service.ts` + `server/src/llm/llm-summarization.service.ts`

1. Pass the user's `UserContext.EMAIL_CATEGORY` items to the summary LLM call
2. Update `summarize-email-tldr.md` (and other summary prompts) to:
   - Accept a dynamic `{{emailCategories}}` list instead of the hardcoded 9 categories
   - Fall back to the hardcoded list only when no user categories exist
3. This ensures the summary path's `categoryExplanation` references categories that actually exist in the user's account

**Changes needed:**
- `summarization.service.ts`: fetch user categories from `UserContext` and pass them through to `runLLMSummarize()`
- `llm-summarization.service.ts` → `summarizeEmailWithPhishingCheck()`: accept `emailCategories` parameter, render into prompt
- `summarize-email-tldr.md`: replace hardcoded category list with `{{emailCategories}}` template, keep hardcoded as default
- Same for `summarize-email-bullets.md` and `summarize-email-actions.md`

### Fix B: Improve Summary Category → Real Category Resolution

**File:** `server/src/emails/llm-summary-processor.service.ts`

When the summary path returns a category that doesn't match via `findMatchingFullCategory()`:
1. Try `canonicaliseCategoryName()` (fuzzy matching already in priority path)
2. Try proto-category matching
3. If still no match and category ≠ "Other", create a proto-category suggestion
4. If category truly doesn't match anything, set `categoryExplanation` to clearly indicate: "Could not match category '[name]' to any user category — defaulting to Other"

### Fix C: Clear Misleading `categoryExplanation` When `categoryId` Is Null

**File:** `server/src/emails/llm-priority-result.service.ts`

In `applyPriorityResult()`, when the final `categoryId` is null (thread stays in "Other"):
1. If `categoryExplanation` references a specific non-Other category, append a disambiguation note: `" (Note: category not found in user's category list — email placed in Other)"`
2. Or better: replace with the priority path's own `categoryExplanation` which is aware of the user's actual categories

### Fix D: Debug Panel Improvement

**File:** `client/src/components/inbox/EmailPreview.tsx`

When displaying the `categoryExplanation` for "Other" emails:
1. If the explanation mentions a specific category name that doesn't match the thread's actual category, show a warning indicator
2. Add a visual distinction between "LLM suggested X but it didn't match" vs "LLM genuinely chose Other"

## Implementation Priority

1. **Fix A** (most impactful): Ensures both LLM paths use the same category vocabulary — prevents the root mismatch
2. **Fix C** (quick win): Makes the debug info honest when a mismatch occurs
3. **Fix B** (defense in depth): Adds fuzzy matching to the summary path
4. **Fix D** (polish): Improves UX for debugging

## Files to Modify

| File | Change |
|------|--------|
| `server/src/summarization/summarization.service.ts` | Fetch + pass user categories |
| `server/src/llm/llm-summarization.service.ts` | Accept categories param, render in prompt |
| `server/promptfoo/prompts/summarize-email-tldr.md` | Dynamic category list |
| `server/promptfoo/prompts/summarize-email-bullets.md` | Dynamic category list |
| `server/promptfoo/prompts/summarize-email-actions.md` | Dynamic category list |
| `server/src/emails/llm-summary-processor.service.ts` | Better category resolution + honest explanation |
| `server/src/emails/llm-priority-result.service.ts` | Honest categoryExplanation when falling to Other |
| `client/src/components/inbox/EmailPreview.tsx` | Visual debug clarity |

## Testing

- Unit tests for `parseSummaryWithPhishing` with dynamic categories
- Integration test: summary + priority path produce consistent `categoryId` + `categoryExplanation`
- Test that incremental-only paths still produce honest debug info
- Test that proto-category suggestion flow works from summary path
- Promptfoo test cases: verify summary prompt with user categories assigns correctly

## Notes

- The `@deprecated` annotations on `PriorityLlmResult.category` and `PriorityLlmResult.categoryExplanation` suggest there was an intention to move categorisation entirely to the summary path — but this migration is incomplete. The priority path still does category resolution. Fix A completes this migration properly.
- The proto-category system (threshold = 5 emails) is working correctly but is only wired into the priority path, not the summary path. Fix B addresses this.

---
*Plan by Monk of Modularity 🧘 — Issue #1509*
