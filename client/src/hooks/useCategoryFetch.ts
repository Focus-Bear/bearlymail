import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

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
}: UseCategoryFetchParams) {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);
  const expandedCategoriesRef = useRef(expandedCategories);
  expandedCategoriesRef.current = expandedCategories;

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
    dispatch(categoryResetAll());
  }, [dispatch]);

  // Single effect: for each expanded category not yet loaded/loading, trigger a fetch.
  // Reads loaded/loading state from refs to avoid re-render loops.
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    const keyToItem = new Map(
      categorySummary.map(cat => [getCategoryKey(cat.id, cat.name), cat])
    );

    expandedCategories.forEach(key => {
      if (
        loadedCategoryNamesRef.current.includes(key) ||
        loadingCategoryNamesRef.current.includes(key) ||
        exhaustedCategoryNamesRef.current.includes(key)
      ) {
        return;
      }

      const item = keyToItem.get(key);
      if (!item) {
        return;
      }

      // Phase 2 dual-write: notify categorySlice of fetch start
      dispatch(categoryFetchStart(key));

      fetchCategoryEmails(item.name, item.id ?? undefined)
        .then(() => {
          // Phase 2 dual-write: emails: [] is intentional — categorySlice tracks fetch status only;
          // actual emails remain in emailSlice (populated by fetchCategoryEmails above).
          dispatch(categoryFetchSuccess({ key, emails: [], fetchedAt: Date.now() }));
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown fetch error';
          dispatch(categoryFetchError({ key, error: message, retryCount: 1, nextRetryAt: Date.now() + CATEGORY_FETCH_RETRY_DELAY_MS }));
        });
    });
  }, [categorySummary, expandedCategories, fetchCategoryEmails, dispatch]);

  return {
    expandedCategories,
    setExpandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  };
}
