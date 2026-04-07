import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { ACCORDION_BUDGETS, measurePerformance } from 'utils/performanceBudget';

import { CATEGORY_FETCH_RETRY_DELAY_MS } from 'constants/numbers';
import { getCategoryKey } from 'hooks/useEmailFetching';
import {
  fetchError as categoryFetchError,
  fetchStart as categoryFetchStart,
  fetchSuccess as categoryFetchSuccess,
  resetAll as categoryResetAll,
} from 'store/slices/categorySlice';
import { AppDispatch } from 'store/store';

const INITIAL_PRELOAD_COUNT = 3;

interface CategorySummaryItem {
  id?: string | null;
  name: string;
}

export interface UseCategoryFetchParams {
  categorySummary: CategorySummaryItem[] | null | undefined;
  fetchCategoryEmails: (name: string, id?: string) => Promise<void>;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames?: string[];
  /**
   * When true, `useInboxInitialization` is running a background refresh via
   * `refreshInPlace` — which already fetches all loaded categories inline.
   * The auto-expand effect is suppressed while this flag is set to prevent
   * duplicate API requests for the same categories. Fix #1665.
   */
  isBackgroundRefreshing?: boolean;
}

/**
 * Phase 2 replacement for useInboxCategoryAccordion.
 *
 * Manages expand/collapse state and triggers category fetches.
 * Dual-writes to both the legacy emailSlice arrays (via fetchCategoryEmails)
 * and the new categorySlice state machine, enabling incremental migration.
 *
 * Key improvement over the old hook:
 * - Single effect instead of Effect 1 + Effect 2 limbo-recovery
 * - Uses refs for loaded/loading checks to avoid re-render cascades
 * - Dispatches to categorySlice for richer per-category status tracking
 */
export function useCategoryFetch({
  categorySummary,
  fetchCategoryEmails,
  loadedCategoryNames,
  loadingCategoryNames,
  exhaustedCategoryNames = [],
  isBackgroundRefreshing = false,
}: UseCategoryFetchParams) {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);
  const expandedCategoriesRef = useRef(expandedCategories);
  expandedCategoriesRef.current = expandedCategories;

  // Tracks which category keys have had a fetch dispatched in the current session.
  // This guards against the category expansion effect firing twice for the same key
  // when categorySummary changes (e.g. after refreshInPlace) before the Redux
  // loadedCategoryNames / loadingCategoryNames have been updated — i.e. the timing
  // window where refs haven't caught up with the latest dispatch yet. See #1665.
  const fetchSessionRef = useRef<Set<string>>(new Set());

  const loadedCategoryNamesRef = useRef(loadedCategoryNames);
  loadedCategoryNamesRef.current = loadedCategoryNames;
  const loadingCategoryNamesRef = useRef(loadingCategoryNames);
  loadingCategoryNamesRef.current = loadingCategoryNames;
  const exhaustedCategoryNamesRef = useRef(exhaustedCategoryNames);
  exhaustedCategoryNamesRef.current = exhaustedCategoryNames;

  const toggleCategory = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  }, []);

  const updateStableCategoryOrder = useCallback((categoryKeys: string[]) => {
    if (categoryKeys.length > 0) {
      setStableCategoryOrder(categoryKeys);
      if (!hasAutoExpandedRef.current) {
        hasAutoExpandedRef.current = true;
        setExpandedCategories(new Set(categoryKeys.slice(0, INITIAL_PRELOAD_COUNT)));
      }
    }
  }, []);

  const resetForModeChange = useCallback(() => {
    setStableCategoryOrder([]);
    setExpandedCategories(new Set());
    hasAutoExpandedRef.current = false;
    fetchSessionRef.current = new Set();
    dispatch(categoryResetAll());
  }, [dispatch]);

  // Single effect: for each expanded category not yet loaded/loading, trigger a fetch.
  // Reads loaded/loading state from refs to avoid re-render loops.
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    // Skip while useInboxInitialization's refreshInPlace is running — it already fetches
    // all loaded categories inline, so triggering our own fetches here would create
    // duplicate parallel requests for the same categories. Fix #1665.
    if (isBackgroundRefreshing) {
      return;
    }

    const keyToItem = new Map(
      categorySummary.map(cat => [getCategoryKey(cat.id, cat.name), cat])
    );

    expandedCategories.forEach(key => {
      if (
        loadedCategoryNamesRef.current.includes(key) ||
        loadingCategoryNamesRef.current.includes(key) ||
        exhaustedCategoryNamesRef.current.includes(key) ||
        fetchSessionRef.current.has(key)
      ) {
        return;
      }

      const item = keyToItem.get(key);
      if (!item) {
        return;
      }

      // Mark as dispatched in the current session before the async call so that
      // a second effect run (e.g. triggered by categorySummary changing via
      // refreshInPlace) doesn't dispatch a duplicate fetch while the first is
      // still in-flight. See #1665.
      fetchSessionRef.current.add(key);

      // Phase 2 dual-write: notify categorySlice of fetch start
      dispatch(categoryFetchStart(key));

      measurePerformance(
        { label: `category-fetch:${item.name}`, budgetMs: ACCORDION_BUDGETS.CATEGORY_FETCH },
        () => fetchCategoryEmails(item.name, item.id ?? undefined)
      )
        .then(() => {
          // Phase 2 dual-write: emails: [] is intentional — categorySlice tracks fetch status only;
          // actual emails remain in emailSlice (populated by fetchCategoryEmails above).
          dispatch(categoryFetchSuccess({ key, emails: [], fetchedAt: Date.now() }));
          // Clear the session guard so legitimate re-fetches (e.g. pull-to-refresh after
          // archiving) can trigger a new fetch for this category. The Set is only cleared
          // on mode change otherwise, which blocks re-fetches within the same mode. See #1665.
          fetchSessionRef.current.delete(key);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown fetch error';
          dispatch(categoryFetchError({ key, error: message, retryCount: 1, nextRetryAt: Date.now() + CATEGORY_FETCH_RETRY_DELAY_MS }));
          // Also clear on error so the retry mechanism can re-dispatch if needed.
          fetchSessionRef.current.delete(key);
        });
    });
  }, [categorySummary, expandedCategories, fetchCategoryEmails, dispatch, isBackgroundRefreshing]);

  return {
    expandedCategories,
    setExpandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  };
}
