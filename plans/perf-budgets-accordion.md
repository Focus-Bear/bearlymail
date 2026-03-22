# Plan: Generic Performance Budgets for Inbox Accordion Load/Render

> **Author:** Monk of Modularity (AI agent)
> **Status:** Planning
> **Labels:** `openclaw`, `planning`, `monk-plan`, `ready-for-codebeard`

---

## Problem

Loading emails for a category (expanding an inbox accordion) is slow. There is no measurement or warning system — we have zero visibility into whether fetch, render, or total time exceeds acceptable thresholds. Jeremy wants a **generic** performance budget utility that can be reused across the app.

## Architecture Overview

### The Accordion Flow (Current State)

**User clicks category header → fetch → render emails:**

1. **Click handler:** `onToggle={() => onToggleCategory(categoryKey)}` in `InboxCategoryItem` (line 309 of `client/src/components/inbox/InboxContentParts.tsx`)
2. **State update:** `toggleCategory()` in `useCategoryFetch` (line 68 of `client/src/hooks/useCategoryFetch.ts`) adds the key to `expandedCategories` Set
3. **Fetch trigger:** `useEffect` in `useCategoryFetch` (line 96 of `client/src/hooks/useCategoryFetch.ts`) detects the new expanded key, calls `fetchCategoryEmails()`
4. **API call:** `fetchCategoryEmailsImpl()` in `useEmailFetching.ts` (line 367) — dispatches `markCategoryLoading`, makes axios GET to `/emails/inbox`, dispatches `updateCategoryEmails` + `markCategoryLoaded`
5. **Render:** React re-renders `InboxCategoryItem` → `CategoryAccordion` → `CategoryAccordionContent` shows the email list (the `children` prop)

### Existing Logger

**File:** `client/src/utils/dev-logger.ts`

Already provides:
- `devLog(message, ...args)` — `[DEV]` prefix, localhost-only
- `devWarn(message, ...args)` — `[DEV WARN]` prefix, localhost-only
- `devError(message, ...args)` — `[DEV ERROR]` prefix, localhost-only
- `devDebug(message, ...args)` — `[DEV DEBUG]` prefix, localhost-only

**Use `devWarn()` for budget violations.** No new logger needed.

### Existing Performance Instrumentation

**None.** No uses of `performance.now()` or `PerformanceObserver` anywhere in `client/src/`.

---

## Design

### 1. Generic `measurePerformance` Utility

**New file:** `client/src/utils/performanceBudget.ts`

```typescript
import { devWarn, devLog } from 'utils/dev-logger';

export interface PerformanceBudget {
  /** Human-readable label for logs (e.g. "category-fetch:Newsletters") */
  label: string;
  /** Budget in milliseconds */
  budgetMs: number;
}

export interface PerformanceMeasurement<T> {
  result: T;
  durationMs: number;
  overBudget: boolean;
  overageMs: number;
}

/**
 * Measure the wall-clock time of an async operation against a budget.
 *
 * - Uses `performance.now()` for high-resolution timing
 * - Calls `devWarn()` if budget is exceeded (localhost-only, via dev-logger)
 * - Returns the result transparently — no behavioral changes
 * - Generic: works with any async operation, not just email fetches
 *
 * @example
 * const { result, durationMs } = await measurePerformance(
 *   { label: 'category-fetch:Newsletters', budgetMs: 2000 },
 *   () => fetchCategoryEmails('Newsletters', categoryId)
 * );
 */
export async function measurePerformance<T>(
  budget: PerformanceBudget,
  operation: () => Promise<T>
): Promise<PerformanceMeasurement<T>> {
  const start = performance.now();
  const result = await operation();
  const end = performance.now();
  const durationMs = Math.round(end - start);
  const overageMs = Math.max(0, durationMs - budget.budgetMs);
  const overBudget = durationMs > budget.budgetMs;

  if (overBudget) {
    devWarn(
      `[PERF BUDGET] "${budget.label}" exceeded budget: ${durationMs}ms / ${budget.budgetMs}ms (+${overageMs}ms over)`
    );
  } else {
    devLog(
      `[PERF BUDGET] "${budget.label}" within budget: ${durationMs}ms / ${budget.budgetMs}ms`
    );
  }

  return { result, durationMs, overBudget, overageMs };
}

/**
 * Measure the wall-clock time of a synchronous operation against a budget.
 * Useful for measuring render phases or synchronous computations.
 */
export function measurePerformanceSync<T>(
  budget: PerformanceBudget,
  operation: () => T
): PerformanceMeasurement<T> {
  const start = performance.now();
  const result = operation();
  const end = performance.now();
  const durationMs = Math.round(end - start);
  const overageMs = Math.max(0, durationMs - budget.budgetMs);
  const overBudget = durationMs > budget.budgetMs;

  if (overBudget) {
    devWarn(
      `[PERF BUDGET] "${budget.label}" exceeded budget: ${durationMs}ms / ${budget.budgetMs}ms (+${overageMs}ms over)`
    );
  } else {
    devLog(
      `[PERF BUDGET] "${budget.label}" within budget: ${durationMs}ms / ${budget.budgetMs}ms`
    );
  }

  return { result, durationMs, overBudget, overageMs };
}

/** Pre-defined budgets for the inbox accordion flow */
export const ACCORDION_BUDGETS = {
  /** Time for the network fetch to return category emails */
  CATEGORY_FETCH: 2000,
  /** Time for React to render the email list after data arrives */
  CATEGORY_RENDER: 500,
  /** Total time from user click to visible emails */
  CATEGORY_TOTAL: 3000,
} as const;
```

### 2. React Hook `usePerformanceBudget`

**New file:** `client/src/hooks/usePerformanceBudget.ts`

```typescript
import { useCallback, useRef } from 'react';
import {
  measurePerformance,
  PerformanceBudget,
  PerformanceMeasurement,
  ACCORDION_BUDGETS,
} from 'utils/performanceBudget';
import { devWarn, devLog } from 'utils/dev-logger';

/**
 * Hook that provides performance measurement for component-level operations.
 *
 * Returns a `measure()` function that wraps any async operation with timing,
 * and a `markStart()`/`markEnd()` pair for measuring spans across renders
 * (e.g. total time from click to visible content).
 *
 * @example
 * const perf = usePerformanceBudget();
 *
 * // Measure a single async operation
 * const { result } = await perf.measure(
 *   { label: 'fetch-newsletters', budgetMs: 2000 },
 *   () => fetchEmails()
 * );
 *
 * // Measure a span across renders (click → visible)
 * const handleClick = () => {
 *   perf.markStart('expand-newsletters');
 *   toggleCategory(key);
 * };
 * // In useEffect when content is visible:
 * useEffect(() => {
 *   if (isLoaded) perf.markEnd('expand-newsletters', 3000);
 * }, [isLoaded]);
 */
export function usePerformanceBudget() {
  const marks = useRef<Map<string, number>>(new Map());

  const measure = useCallback(
    async <T>(
      budget: PerformanceBudget,
      operation: () => Promise<T>
    ): Promise<PerformanceMeasurement<T>> => {
      return measurePerformance(budget, operation);
    },
    []
  );

  /** Record a start timestamp for a named span */
  const markStart = useCallback((spanLabel: string) => {
    marks.current.set(spanLabel, performance.now());
  }, []);

  /**
   * Record the end of a named span and check against a budget.
   * Returns the duration, or null if no matching start mark exists.
   */
  const markEnd = useCallback((spanLabel: string, budgetMs: number): number | null => {
    const startTime = marks.current.get(spanLabel);
    if (startTime === undefined) {
      return null;
    }
    marks.current.delete(spanLabel);
    const durationMs = Math.round(performance.now() - startTime);
    const overageMs = Math.max(0, durationMs - budgetMs);

    if (durationMs > budgetMs) {
      devWarn(
        `[PERF BUDGET] "${spanLabel}" exceeded budget: ${durationMs}ms / ${budgetMs}ms (+${overageMs}ms over)`
      );
    } else {
      devLog(
        `[PERF BUDGET] "${spanLabel}" within budget: ${durationMs}ms / ${budgetMs}ms`
      );
    }

    return durationMs;
  }, []);

  return { measure, markStart, markEnd };
}
```

### 3. Integration Points — Exact Locations

#### 3A. Instrument the fetch in `useCategoryFetch.ts`

**File:** `client/src/hooks/useCategoryFetch.ts`
**Location:** Inside the `useEffect` at line 96, where `fetchCategoryEmails` is called

**Current code (line 107-116):**
```typescript
dispatch(categoryFetchStart(key));

fetchCategoryEmails(item.name, item.id ?? undefined)
  .then(() => {
    dispatch(categoryFetchSuccess({ key, emails: [], fetchedAt: Date.now() }));
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    dispatch(categoryFetchError({ key, error: message, retryCount: 1, nextRetryAt: Date.now() + CATEGORY_FETCH_RETRY_DELAY_MS }));
  });
```

**Change to:**
```typescript
dispatch(categoryFetchStart(key));

measurePerformance(
  { label: `category-fetch:${item.name}`, budgetMs: ACCORDION_BUDGETS.CATEGORY_FETCH },
  () => fetchCategoryEmails(item.name, item.id ?? undefined)
)
  .then(({ result }) => {
    dispatch(categoryFetchSuccess({ key, emails: [], fetchedAt: Date.now() }));
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    dispatch(categoryFetchError({ key, error: message, retryCount: 1, nextRetryAt: Date.now() + CATEGORY_FETCH_RETRY_DELAY_MS }));
  });
```

**Add import at top of file:**
```typescript
import { measurePerformance, ACCORDION_BUDGETS } from 'utils/performanceBudget';
```

#### 3B. Instrument total click-to-visible time in `InboxContentParts.tsx`

**File:** `client/src/components/inbox/InboxContentParts.tsx`
**Component:** `InboxCategoryItem` (line 211)

This requires measuring the span from when the user clicks the toggle to when `isLoaded` becomes true.

**Add to `InboxCategoryItem` component body (after line 230, before the auto-collapse useEffect):**

```typescript
const perf = usePerformanceBudget();

// Mark the start of a category expand when user toggles it open
const handleToggleWithTiming = useCallback((key: string) => {
  // Only mark start when expanding (not collapsing)
  if (!isExpanded) {
    perf.markStart(`category-total:${categoryName}`);
  }
  onToggleCategory(key);
}, [isExpanded, categoryName, onToggleCategory, perf]);

// Mark the end when content finishes loading (measures total click-to-visible)
useEffect(() => {
  if (isExpanded && isLoaded) {
    perf.markEnd(`category-total:${categoryName}`, ACCORDION_BUDGETS.CATEGORY_TOTAL);
  }
}, [isExpanded, isLoaded, categoryName, perf]);
```

**Update the `onToggle` prop on `CategoryAccordion` (line 309):**

Current:
```typescript
onToggle={() => onToggleCategory(categoryKey)}
```

Change to:
```typescript
onToggle={() => handleToggleWithTiming(categoryKey)}
```

**Add imports at top of file:**
```typescript
import { usePerformanceBudget } from 'hooks/usePerformanceBudget';
import { ACCORDION_BUDGETS } from 'utils/performanceBudget';
```

#### 3C. Instrument render time in `InboxContentParts.tsx`

**File:** `client/src/components/inbox/InboxContentParts.tsx`
**Component:** `InboxCategoryItem`

Add a `useEffect` to measure the time between data arriving (isLoaded flipping true) and the next paint:

```typescript
const renderStartRef = useRef<number | null>(null);

// When isLoaded transitions to true, mark the render start
useEffect(() => {
  if (isLoaded && isExpanded && renderStartRef.current === null) {
    renderStartRef.current = performance.now();
    // Use requestAnimationFrame to measure after React commits + browser paints
    requestAnimationFrame(() => {
      if (renderStartRef.current !== null) {
        const durationMs = Math.round(performance.now() - renderStartRef.current);
        const budget = ACCORDION_BUDGETS.CATEGORY_RENDER;
        if (durationMs > budget) {
          devWarn(
            `[PERF BUDGET] "category-render:${categoryName}" exceeded budget: ${durationMs}ms / ${budget}ms (+${durationMs - budget}ms over)`
          );
        } else {
          devLog(
            `[PERF BUDGET] "category-render:${categoryName}" within budget: ${durationMs}ms / ${budget}ms`
          );
        }
        renderStartRef.current = null;
      }
    });
  }
  if (!isExpanded) {
    renderStartRef.current = null;
  }
}, [isLoaded, isExpanded, categoryName]);
```

**Add import:**
```typescript
import { devWarn, devLog } from 'utils/dev-logger';
```

---

## Budget Thresholds

| Phase | Budget | Rationale |
|-------|--------|-----------|
| Network fetch (`CATEGORY_FETCH`) | 2000ms | Gmail API is slow; 2s is generous but flags truly broken fetches. Can tighten later with data. |
| Render (`CATEGORY_RENDER`) | 500ms | React should render a list of 20-50 emails in well under 500ms. Exceeding this signals a rendering bottleneck. |
| Total click-to-visible (`CATEGORY_TOTAL`) | 3000ms | 3s total UX budget. Anything longer feels broken to users. |

These are starting values. Once we collect data in dev, we can tighten them.

---

## New Files

| File | Type | Description |
|------|------|-------------|
| `client/src/utils/performanceBudget.ts` | Utility | Generic `measurePerformance()` + `measurePerformanceSync()` + `ACCORDION_BUDGETS` constants |
| `client/src/hooks/usePerformanceBudget.ts` | Hook | `usePerformanceBudget()` with `measure()`, `markStart()`, `markEnd()` |
| `client/src/utils/__tests__/performanceBudget.test.ts` | Test | Unit tests for `measurePerformance`, `measurePerformanceSync` |
| `client/src/hooks/__tests__/usePerformanceBudget.test.ts` | Test | Unit tests for the hook |

## Modified Files

| File | Lines | Change |
|------|-------|--------|
| `client/src/hooks/useCategoryFetch.ts` | ~107-116 | Wrap `fetchCategoryEmails` call in `measurePerformance()` |
| `client/src/components/inbox/InboxContentParts.tsx` | ~230, ~309 | Add `usePerformanceBudget` for total timing + render timing |

## Non-Goals

- No changes to production logging (dev-only via `devWarn`)
- No UI for performance metrics (just console warnings)
- No changes to fetch behavior, retry logic, or error handling
- No `PerformanceObserver` or Web Vitals integration (future work)
- No server-side performance tracking

---

## Test Plan

### Unit Tests (`performanceBudget.test.ts`)
1. `measurePerformance` returns result transparently
2. `measurePerformance` reports correct duration
3. `measurePerformance` calls `devWarn` when over budget
4. `measurePerformance` calls `devLog` when within budget
5. `measurePerformanceSync` works for sync operations
6. Budget overage calculation is correct

### Unit Tests (`usePerformanceBudget.test.ts`)
1. `measure()` wraps async operations correctly
2. `markStart()`/`markEnd()` tracks spans
3. `markEnd()` returns null for unknown spans
4. Budget violations logged via `devWarn`

### Manual Testing
1. Open inbox in dev mode
2. Expand a category accordion
3. Check console for `[PERF BUDGET]` messages
4. Verify warnings appear only when budget exceeded
5. Verify no console output in production (non-localhost)
