import { useCallback, useRef } from 'react';
import { devLog, devWarn } from 'utils/dev-logger';
import { measurePerformance, PerformanceBudgetOptions, PerformanceMeasurement } from 'utils/performanceBudget';

/**
 * Hook that provides performance measurement for component-level operations.
 *
 * Returns:
 * - `measure()` — wraps any async operation with timing + budget check
 * - `markStart(label)` — records a start timestamp for a named span
 * - `markEnd(label, budgetMs)` — ends a span, logs a warning if over budget
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
 * useEffect(() => {
 *   if (isLoaded) perf.markEnd('expand-newsletters', 3000);
 * }, [isLoaded]);
 */
export function usePerformanceBudget() {
  const marks = useRef<Map<string, number>>(new Map());

  const measure = useCallback(
    <T>(options: PerformanceBudgetOptions, operation: () => Promise<T>): Promise<PerformanceMeasurement<T>> =>
      measurePerformance(options, operation),
    []
  );

  /** Record a start timestamp for a named span */
  const markStart = useCallback((spanLabel: string) => {
    if (marks.current.has(spanLabel)) {
      devWarn(`[PerfBudget] markStart: overwriting existing span "${spanLabel}"`);
    }
    marks.current.set(spanLabel, performance.now());
  }, []);

  /**
   * Record the end of a named span and check against a budget.
   * Returns the duration in ms, or null if no matching start mark exists.
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
      devWarn(`[PerfBudget] ${spanLabel} exceeded budget: ${durationMs}ms > ${budgetMs}ms (overage: ${overageMs}ms)`);
    } else {
      devLog(`[PerfBudget] ${spanLabel} within budget: ${durationMs}ms / ${budgetMs}ms`);
    }

    return durationMs;
  }, []);

  return { measure, markStart, markEnd };
}
