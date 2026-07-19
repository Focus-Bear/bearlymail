import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { ACCORDION_BUDGETS, measurePerformance } from 'utils/performanceBudget';

import { CATEGORY_FETCH_RETRY_DELAY_MS } from 'constants/numbers';
import { getCategoryKey } from 'hooks/useEmailFetching';
import {
  fetchBudgetWarning,
  fetchError as categoryFetchError,
  fetchStart as categoryFetchStart,
  fetchSuccess as categoryFetchSuccess,
  resetAll as categoryResetAll,
} from 'store/slices/categorySlice';
import { markCategoryLoaded } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

/** Number of categories to auto-expand on initial mount (sorted by email count desc). */
const INITIAL_PRELOAD_COUNT = 6;

/** Fire budget-warning signal when fetch reaches this fraction of the budget. */
const BUDGET_WARNING_THRESHOLD = 0.8;
const CATEGORY_FETCH_WARNING_MS = ACCORDION_BUDGETS.CATEGORY_FETCH * BUDGET_WARNING_THRESHOLD;

interface CategorySummaryItem {
  id?: string | null;
  name: string;
  count?: number;
}

export interface UseCategoryFetchParams {
  categorySummary: CategorySummaryItem[] | null | undefined;
  fetchCategoryEmails: (name: string, id?: string) => Promise<void>;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames?: string[];
}

/** Phase 2 replacement for useInboxCategoryAccordion. Manages expand/collapse state, triggers category fetches, and dual-writes to emailSlice and categorySlice. Single effect instead of Effect 1 + Effect 2 limbo-recovery; uses refs to avoid re-render cascades. */
export function useCategoryFetch({
  categorySummary,
  fetchCategoryEmails,
  loadedCategoryNames,
  loadingCategoryNames,
  exhaustedCategoryNames = [],
}: UseCategoryFetchParams) {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  /**
   * The category the user most recently expanded — the target for the Delete → "Archive All"
   * hotkey (useCategoryArchiveAllHotkey). Only set on an explicit user toggle (not auto-expand),
   * and cleared when that category is collapsed, so "the open accordion" is unambiguous.
   */
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const activeCategoryKeyRef = useRef(activeCategoryKey);
  activeCategoryKeyRef.current = activeCategoryKey;
  /** Keys queued for background (silent) preload — stored in a Ref to avoid render cycles on clear. */
  const preloadKeysRef = useRef<Set<string>>(new Set());
  /** Incremented whenever a new preload key is added, triggering the fetch effect without state churn. */
  const [preloadTrigger, setPreloadTrigger] = useState(0);
  const hasAutoExpandedRef = useRef(false);
  const expandedCategoriesRef = useRef(expandedCategories);
  expandedCategoriesRef.current = expandedCategories;
  const stableCategoryOrderRef = useRef(stableCategoryOrder);
  stableCategoryOrderRef.current = stableCategoryOrder;

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

  /**
   * When the user expands a category, find the next unloaded category in
   * stableCategoryOrder and queue it for a silent background fetch so it is
   * ready before the user scrolls down to it.
   */
  const triggerLookaheadPreload = useCallback((expandedKey: string) => {
    const order = stableCategoryOrderRef.current;
    const loaded = loadedCategoryNamesRef.current;
    const loading = loadingCategoryNamesRef.current;
    const exhausted = exhaustedCategoryNamesRef.current;
    const expanded = expandedCategoriesRef.current;

    const idx = order.indexOf(expandedKey);
    for (let i = idx + 1; i < order.length; i++) {
      const nextKey = order[i];
      if (
        !loaded.includes(nextKey) &&
        !loading.includes(nextKey) &&
        !exhausted.includes(nextKey) &&
        !expanded.has(nextKey) &&
        !fetchSessionRef.current.has(nextKey)
      ) {
        if (!preloadKeysRef.current.has(nextKey)) {
          preloadKeysRef.current.add(nextKey);
          setPreloadTrigger(prev => prev + 1);
        }
        break;
      }
    }
  }, []);

  const toggleCategory = useCallback((categoryKey: string) => {
    const isExpanding = !expandedCategoriesRef.current.has(categoryKey);
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
    if (isExpanding) {
      setActiveCategoryKey(categoryKey);
      triggerLookaheadPreload(categoryKey);
    } else if (activeCategoryKeyRef.current === categoryKey) {
      // Collapsing the active accordion — no unambiguous Delete target until one is reopened.
      setActiveCategoryKey(null);
    }
  }, [triggerLookaheadPreload]);

  const updateStableCategoryOrder = useCallback((categoryKeys: string[], summaryItems?: CategorySummaryItem[]) => {
    if (categoryKeys.length > 0) {
      setStableCategoryOrder(categoryKeys);
      if (!hasAutoExpandedRef.current) {
        hasAutoExpandedRef.current = true;
        // Sort by email count desc so top INITIAL_PRELOAD_COUNT categories expand first on mount.
        const keyToCount = summaryItems
          ? new Map(summaryItems.map(item => [getCategoryKey(item.id, item.name), item.count ?? 0]))
          : null;
        const orderedKeys = keyToCount
          ? [...categoryKeys].sort((keyA, keyB) => (keyToCount.get(keyB) ?? 0) - (keyToCount.get(keyA) ?? 0))
          : categoryKeys;
        setExpandedCategories(new Set(orderedKeys.slice(0, INITIAL_PRELOAD_COUNT)));
      }
    }
  }, []);

  const resetForModeChange = useCallback(() => {
    setStableCategoryOrder([]);
    setExpandedCategories(new Set());
    setActiveCategoryKey(null);
    preloadKeysRef.current.clear();
    hasAutoExpandedRef.current = false;
    fetchSessionRef.current = new Set();
    dispatch(categoryResetAll());
  }, [dispatch]);

  // Single effect: for each expanded or preload-queued category not yet loaded/loading,
  // trigger a fetch. Reads loaded/loading state from refs to avoid re-render loops.
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    const keyToItem = new Map(categorySummary.map(cat => [getCategoryKey(cat.id, cat.name), cat]));

    const dispatchFetch = (key: string) => {
      if (
        loadedCategoryNamesRef.current.includes(key) ||
        loadingCategoryNamesRef.current.includes(key) ||
        exhaustedCategoryNamesRef.current.includes(key) ||
        fetchSessionRef.current.has(key) ||
        !keyToItem.has(key)
      ) {
        return;
      }

      const item = keyToItem.get(key)!;

      // Fix #1689: Fast-path for categories the fresh summary says are empty.
      // Avoids a redundant API call and resolves the spinner immediately when
      // the category has 0 emails according to the current summary.
      if ((item.count ?? 0) === 0) {
        dispatch(markCategoryLoaded(key));
        return;
      }

      // Mark as dispatched in the current session before the async call so that
      // a second effect run (e.g. triggered by categorySummary changing via
      // refreshInPlace) doesn't dispatch a duplicate fetch while the first is
      // still in-flight. See #1665.
      fetchSessionRef.current.add(key);

      // Phase 2 dual-write: notify categorySlice of fetch start
      dispatch(categoryFetchStart(key));

      measurePerformance({ label: `category-fetch:${item.name}`, budgetMs: ACCORDION_BUDGETS.CATEGORY_FETCH }, () =>
        fetchCategoryEmails(item.name, item.id ?? undefined)
      )
        .then(({ durationMs, overBudget }) => {
          // Dual-write: categorySlice tracks fetch status only; emails live in emailSlice.
          dispatch(categoryFetchSuccess({ key, emails: [], fetchedAt: Date.now() }));
          fetchSessionRef.current.delete(key);
          // Dispatch a budget-warning when the fetch is approaching or over budget.
          if (overBudget || durationMs >= CATEGORY_FETCH_WARNING_MS) {
            dispatch(fetchBudgetWarning(key));
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown fetch error';
          dispatch(
            categoryFetchError({
              key,
              error: message,
              retryCount: 1,
              nextRetryAt: Date.now() + CATEGORY_FETCH_RETRY_DELAY_MS,
            })
          );
          // Also clear on error so the retry mechanism can re-dispatch if needed.
          fetchSessionRef.current.delete(key);
        });
    };

    expandedCategories.forEach(dispatchFetch);
    if (preloadKeysRef.current.size > 0) {
      preloadKeysRef.current.forEach(dispatchFetch);
      preloadKeysRef.current.clear();
    }
  }, [categorySummary, expandedCategories, preloadTrigger, fetchCategoryEmails, dispatch]);

  return {
    expandedCategories,
    setExpandedCategories,
    stableCategoryOrder,
    activeCategoryKey,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  };
}
