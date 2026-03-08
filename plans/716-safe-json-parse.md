# PLAN: [PostHog][P2] SyntaxError: Unexpected end of JSON input — 70 occurrences in 24h

**Issue:** Focus-Bear/BearlyMail#716  
**Branch:** `plan/issue-716`

## Context

70 occurrences/day of `SyntaxError: Unexpected end of JSON input` — a `JSON.parse()` call receiving a truncated, empty, or null string. Two root cause categories: **LLM response parsing** (server) and **localStorage reads** (client).

## Root Cause

### Category A — LLM response parsing in `llm.service.ts` (most likely)

**File:** `server/src/llm/llm.service.ts`

Multiple `JSON.parse()` calls on LLM-extracted JSON strings have **no try-catch**:

```typescript
// Line ~180 — no try-catch:
const parsed = JSON.parse(jsonMatch[0]);

// Line ~771 — no try-catch:
const parsed = JSON.parse(jsonMatch[0]);
```

When an LLM response is truncated (streaming timeout, rate limit mid-response, or the model outputs partial JSON), `jsonMatch[0]` may be a partial JSON string like `{"actions": [{"conf` — which throws `SyntaxError: Unexpected end of JSON input`.

### Category B — Client-side localStorage reads

**Files:** Various client hooks

Some `localStorage.getItem()` → `JSON.parse()` patterns lack try-catch or handle empty strings:

```typescript
// client/src/hooks/useTabCounts.ts line ~42 — inside try-catch ✓
// client/src/hooks/useInboxFilters.ts line ~38 — inside try-catch ✓
// client/src/contexts/useAuthInitialization.ts line ~32 — NO try-catch:
const payload = JSON.parse(atob(token.split('.')[1]));  // ← throws if token is malformed
```

The `axios-interceptors.ts` has the same pattern:
```typescript
const payload = JSON.parse(atob(token.split('.')[1]));  // line 14 — in try-catch ✓
```

`useAuthInitialization.ts` parses a JWT payload — if the token string is malformed (partial write to localStorage, corrupted data), this throws.

## Fix

### 1. Add try-catch to bare `JSON.parse()` calls in `llm.service.ts`

**File:** `server/src/llm/llm.service.ts`

All bare `JSON.parse()` calls should be wrapped. There are several patterns:

**Pattern A** — Returns `null` on failure (context extraction, smart compose):
```typescript
// Before:
const parsed = JSON.parse(jsonMatch[0]);

// After:
let parsed: Record<string, unknown> | null = null;
try {
  parsed = JSON.parse(jsonMatch[0]);
} catch (parseError) {
  this.logger.warn('Failed to parse LLM JSON response (truncated?)', {
    snippet: jsonMatch[0].slice(0, 100),
    error: parseError instanceof Error ? parseError.message : String(parseError),
  });
  return null; // or appropriate fallback
}
```

**Pattern B** — Returns empty array on failure (actions, action items):
```typescript
try {
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.actions || [];
} catch {
  this.logger.warn('Failed to parse LLM actions JSON — returning empty array');
  return [];
}
```

The `parseJsonString<T>` helper in `incremental-analysis.service.ts` (line 274) already has a try-catch pattern — consider extracting it as a shared utility:

```typescript
// server/src/utils/json.ts
export function safeJsonParse<T>(jsonStr: string, fallback: T, label?: string): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    if (label) {
      logger.warn(`Failed to parse JSON (${label}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return fallback;
  }
}
```

Use `safeJsonParse` throughout `llm.service.ts`.

### 2. Fix `useAuthInitialization.ts` JWT decode

**File:** `client/src/contexts/useAuthInitialization.ts`

```typescript
// Before (line ~32):
const payload = JSON.parse(atob(token.split('.')[1]));

// After:
let payload: { exp?: number } = {};
try {
  const base64Part = token.split('.')[1];
  if (base64Part) {
    payload = JSON.parse(atob(base64Part));
  }
} catch {
  // Malformed JWT — treat as invalid/expired
  return false;
}
```

### 3. Validate LLM response completeness before parsing

For LLM responses specifically, add a quick sanity check before attempting `JSON.parse`:

```typescript
// Check that the JSON string starts and ends with matching braces/brackets
function isLikelyCompleteJson(str: string): boolean {
  const trimmed = str.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

// Usage:
if (jsonMatch && isLikelyCompleteJson(jsonMatch[0])) {
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // ...
  } catch {
    this.logger.warn('JSON matched but failed to parse');
    return null;
  }
} else {
  this.logger.warn('Incomplete JSON from LLM response');
  return null;
}
```

### 4. Identify the specific call site via PostHog stack trace

Before implementing the full fix, check the PostHog error tracking link to get the stack trace — this will confirm whether the error is server-side (Node.js/llm.service.ts) or client-side (browser):

- If stack trace shows `llm.service.ts` → focus on fix #1
- If stack trace shows `useAuthInitialization.ts` or browser context → focus on fix #2
- Stack trace will show the exact line number

## Files to Modify

| File | Change |
|------|--------|
| `server/src/llm/llm.service.ts` | Wrap bare `JSON.parse()` calls in try-catch with fallback returns |
| `server/src/utils/json.ts` | Create `safeJsonParse<T>()` utility (new file) |
| `server/src/llm/incremental-analysis.service.ts` | Use `safeJsonParse` (refactor existing pattern) |
| `client/src/contexts/useAuthInitialization.ts` | Add try-catch around JWT decode |

## Acceptance Criteria

- [ ] All bare `JSON.parse()` calls in `llm.service.ts` wrapped in try-catch with appropriate fallbacks
- [ ] `safeJsonParse<T>()` utility created and used consistently
- [ ] `useAuthInitialization.ts` JWT decode wrapped
- [ ] PostHog `SyntaxError: Unexpected end of JSON input` events drop to near-zero
- [ ] No regression in LLM feature output (fallback returns are appropriate for each call site)

## Risk / Notes

- Low risk — adding try-catch doesn't change happy path behaviour
- Verify fallback return values are correct per call site (some return `null`, some return `[]`, some return empty objects)
- P2 priority — lower urgency than #715, can be included in the same PR batch or handled separately
