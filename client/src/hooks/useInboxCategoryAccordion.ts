import { useCallback,useEffect, useRef, useState } from 'react';

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

  // Fetch expanded categories whose data is missing.
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

  // Re-fetch expanded category emails when categorySummary reloads after a background poll.
  const prevCategorySummaryRef = useRef<typeof categorySummary>(null);
  const expandedCategoriesForRefetchRef = useRef(expandedCategories);
  expandedCategoriesForRefetchRef.current = expandedCategories;

  useEffect(() => {
    const wasNull = prevCategorySummaryRef.current === null;
    prevCategorySummaryRef.current = categorySummary ?? null;
    if (!wasNull || !categorySummary) return;
    const toRefetch = Array.from(expandedCategoriesForRefetchRef.current).filter(
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
