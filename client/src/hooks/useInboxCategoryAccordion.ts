import { useCallback, useEffect, useRef, useState } from 'react';

interface CategorySummaryItem {
  id?: string;
  name: string;
}

interface UseInboxCategoryAccordionParams {
  categorySummary: CategorySummaryItem[] | null | undefined;
  fetchCategoryEmails: (name: string, id?: string) => Promise<void>;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
}

const INITIAL_PRELOAD_COUNT = 3;

/**
 * Manages category accordion expand/collapse state and prefetching.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxCategoryAccordion({
  categorySummary,
  fetchCategoryEmails,
  loadedCategoryNames,
  loadingCategoryNames,
}: UseInboxCategoryAccordionParams) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);

  const loadedCategoryNamesRef = useRef(loadedCategoryNames);
  loadedCategoryNamesRef.current = loadedCategoryNames;
  const loadingCategoryNamesRef = useRef(loadingCategoryNames);
  loadingCategoryNamesRef.current = loadingCategoryNames;

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) { next.delete(category); } else { next.add(category); }
      return next;
    });
  }, []);

  const updateStableCategoryOrder = useCallback((categories: string[]) => {
    if (categories.length > 0) {
      setStableCategoryOrder(categories);
      if (!hasAutoExpandedRef.current) {
        hasAutoExpandedRef.current = true;
        setExpandedCategories(new Set(categories.slice(0, INITIAL_PRELOAD_COUNT)));
      }
    }
  }, []);

  const resetForModeChange = useCallback(() => {
    setStableCategoryOrder([]);
    setExpandedCategories(new Set());
    hasAutoExpandedRef.current = false;
  }, []);

  // Always keep a current ref to expandedCategories so limbo-recovery and summary-refetch
  // effects can read it without depending on it as a reactive dep.
  const expandedCategoriesRef = useRef(expandedCategories);
  expandedCategoriesRef.current = expandedCategories;

  // Effect 1 — Primary fetch: fires when expandedCategories or categorySummary changes.
  // This handles the normal "user expanded an accordion" path.
  // Uses refs for loaded/loading checks so fetchCategoryEmails stays stable and this
  // effect doesn't re-run just because another category finished loading.
  useEffect(() => {
    if (!categorySummary) return;
    const toFetch = Array.from(expandedCategories).filter(
      category => !loadedCategoryNamesRef.current.includes(category) && !loadingCategoryNamesRef.current.includes(category)
    );
    if (toFetch.length === 0) return;
    toFetch.forEach(categoryName => {
      const categoryItem = categorySummary.find(c => c.name === categoryName);
      fetchCategoryEmails(categoryName, categoryItem?.id).catch(err =>
        console.error(`Error fetching category "${categoryName}":`, err)
      );
    });
  }, [categorySummary, expandedCategories, fetchCategoryEmails]);

  // Effect 2 — Limbo-state recovery: re-triggers a fetch for any expanded category
  // that ended up neither loaded nor loading (e.g. after markCategoryLoadFailed removes
  // it from loadingCategoryNames, or after clearCategoryState resets everything).
  //
  // IMPORTANT: expandedCategories is intentionally NOT in the dep array — it is read
  // via expandedCategoriesRef instead. Effect 1 already handles new expansions; if
  // expandedCategories were also a dep here, both effects would fire simultaneously
  // on every expand, producing duplicate API calls before the Redux store has had a
  // chance to re-render and update the loading-state refs.
  //
  // limboDispatchedRef is a defence-in-depth guard that prevents this effect from
  // dispatching a second fetch for a category that is already in flight (e.g. if
  // React batches cause both effects to evaluate before the first dispatch lands).
  const limboDispatchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!categorySummary) return;
    const limboCategories = Array.from(expandedCategoriesRef.current).filter(
      category =>
        !loadedCategoryNames.includes(category) &&
        !loadingCategoryNames.includes(category) &&
        !limboDispatchedRef.current.has(category),
    );
    if (limboCategories.length === 0) return;
    limboCategories.forEach(categoryName => {
      limboDispatchedRef.current.add(categoryName);
      const categoryItem = categorySummary.find(c => c.name === categoryName);
      fetchCategoryEmails(categoryName, categoryItem?.id)
        .catch(err => console.error(`[limbo-recovery] Error re-fetching category "${categoryName}":`, err))
        .finally(() => { limboDispatchedRef.current.delete(categoryName); });
    });
    // expandedCategories intentionally omitted — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySummary, loadedCategoryNames, loadingCategoryNames, fetchCategoryEmails]);

  // Effect 3 — Re-fetch expanded category emails when categorySummary reloads after a
  // background poll (null → populated transition).
  const prevCategorySummaryRef = useRef<typeof categorySummary>(null);

  useEffect(() => {
    const wasNull = prevCategorySummaryRef.current === null;
    prevCategorySummaryRef.current = categorySummary ?? null;
    if (!wasNull || !categorySummary) return;
    const toRefetch = Array.from(expandedCategoriesRef.current).filter(
      category => !loadedCategoryNamesRef.current.includes(category) && !loadingCategoryNamesRef.current.includes(category)
    );
    toRefetch.forEach(categoryName => {
      const categoryItem = categorySummary.find(c => c.name === categoryName);
      fetchCategoryEmails(categoryName, categoryItem?.id).catch(err =>
        console.error(`Error re-fetching category "${categoryName}":`, err)
      );
    });
  }, [categorySummary, fetchCategoryEmails]);

  return {
    expandedCategories,
    setExpandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  };
}
