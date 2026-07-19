import { devLog, devWarn } from './dev-logger';

export interface PerformanceBudgetOptions {
  label: string;
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
 * const { result } = await measurePerformance(
 *   { label: 'category-fetch:Newsletters', budgetMs: 2000 },
 *   () => fetchCategoryEmails('Newsletters', categoryId)
 * );
 */
export async function measurePerformance<T>(
  options: PerformanceBudgetOptions,
  operation: () => Promise<T>
): Promise<PerformanceMeasurement<T>> {
  const start = performance.now();
  const result = await operation();
  const durationMs = Math.round(performance.now() - start);
  const overageMs = Math.max(0, durationMs - options.budgetMs);
  const overBudget = durationMs > options.budgetMs;

  if (overBudget) {
    devWarn(
      `[PerfBudget] ${options.label} exceeded budget: ${durationMs}ms > ${options.budgetMs}ms (overage: ${overageMs}ms)`
    );
  } else {
    devLog(`[PerfBudget] ${options.label} within budget: ${durationMs}ms / ${options.budgetMs}ms`);
  }

  return { result, durationMs, overBudget, overageMs };
}

/** Pre-defined budgets for the inbox accordion flow */
export const ACCORDION_BUDGETS = {
  /** Time for the network fetch to return category emails */
  CATEGORY_FETCH: 2000,
  /** Time from data-ready to next paint (commit-to-paint via RAF; not React reconciliation time) */
  CATEGORY_PAINT: 500,
  /** Total time from user click to visible emails */
  CATEGORY_TOTAL: 3000,
} as const;
