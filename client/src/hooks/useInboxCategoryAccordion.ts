import { useCallback, useEffect, useRef, useState } from 'react';
import { devLog } from 'utils/dev-logger';

import { getCategoryKey } from 'hooks/useEmailFetching';

interface CategorySummaryItem {
  id?: string | null;
  name: string;
  count?: number;
}

interface UseInboxCategoryAccordionParams {
  categorySummary: CategorySummaryItem[] | null | undefined;
  fetchCategoryEmails: (name: string, id?: string) => Promise<void>;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames?: string[];
}

const INITIAL_PRELOAD_COUNT = 3;

interface UseCategoryFetchEffectsParams {
  categorySummary: CategorySummaryItem[] | null | undefined;
  expandedCategories: Set<string>;
  expandedCategoriesRef: React.MutableRefObject<Set<string>>;
  loadedCategoryNames: string[];
  loadingCategoryNames: string[];
  exhaustedCategoryNames: string[];
  loadedCategoryNamesRef: React.MutableRefObject<string[]>;
  loadingCategoryNamesRef: React.MutableRefObject<string[]>;
  fetchCategoryEmails: (name: string, id?: string) => Promise<void>;
}

/**
 * Encapsulates the two category-fetch side effects for the accordion:
 *   Effect 1 — normal "user expanded" path (reactive to expandedCategories)
 *   Effect 2 — limbo-state recovery (reactive to loaded/loading lists, not expandedCategories)
 *
 * Extracted from useInboxCategoryAccordion to keep that hook under the
 * max-lines-per-function limit.
 */
function useCategoryFetchEffects({
  categorySummary,
  expandedCategories,
  expandedCategoriesRef,
  loadedCategoryNames,
  loadingCategoryNames,
  exhaustedCategoryNames,
  loadedCategoryNamesRef,
  loadingCategoryNamesRef,
  fetchCategoryEmails,
}: UseCategoryFetchEffectsParams): void {
  // Effect 1 — Primary fetch: fires when expandedCategories or categorySummary changes.
  // This handles the normal "user expanded an accordion" path.
  // Uses refs for loaded/loading checks so fetchCategoryEmails stays stable and this
  // effect doesn't re-run just because another category finished loading.
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    // Build a key→item map for fast lookup
    const keyToItem = new Map(categorySummary.map(cat => [getCategoryKey(cat.id, cat.name), cat]));

    const toFetch = Array.from(expandedCategories).filter(
      key => !loadedCategoryNamesRef.current.includes(key) && !loadingCategoryNamesRef.current.includes(key)
    );
    if (toFetch.length === 0) {
      return;
    }
    devLog(
      '[Accordion] Effect1 queuing fetch for keys:',
      toFetch,
      '| expanded:',
      Array.from(expandedCategories),
      '| loaded:',
      loadedCategoryNamesRef.current,
      '| loading:',
      loadingCategoryNamesRef.current
    );
    toFetch.forEach(categoryKey => {
      const item = keyToItem.get(categoryKey);
      fetchCategoryEmails(item?.name ?? categoryKey, item?.id ?? undefined).catch(err =>
        console.error(`Error fetching category key "${categoryKey}":`, err) // nosemgrep
      );
    });
  }, [categorySummary, expandedCategories, fetchCategoryEmails, loadedCategoryNamesRef, loadingCategoryNamesRef]);

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
  // Ref-based callback pattern: reads the latest expandedCategoriesRef snapshot without
  // treating it as a reactive dependency — preventing the double-fetch race described
  // above. (useEffectEvent does not exist in React 19.2 stable; this is the stable equivalent.)
  const getLimboCategoriesRef = useRef<
    (
      keyToItem: Map<string, CategorySummaryItem>,
      loaded: string[],
      loading: string[],
      exhausted: string[],
      dispatched: Set<string>
    ) => string[]
  >(() => []);
  getLimboCategoriesRef.current = (
    keyToItem: Map<string, CategorySummaryItem>,
    loaded: string[],
    loading: string[],
    exhausted: string[],
    dispatched: Set<string>
  ) =>
    Array.from(expandedCategoriesRef.current).filter(
      key => !loaded.includes(key) && !loading.includes(key) && !exhausted.includes(key) && !dispatched.has(key)
    );

  const limboDispatchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    const keyToItem = new Map(categorySummary.map(cat => [getCategoryKey(cat.id, cat.name), cat]));

    const limboCategories = getLimboCategoriesRef.current(
      keyToItem,
      loadedCategoryNames,
      loadingCategoryNames,
      exhaustedCategoryNames,
      limboDispatchedRef.current
    );
    if (limboCategories.length === 0) {
      return;
    }
    devLog(
      '[Accordion] Effect2 (limbo) re-fetching keys:',
      limboCategories,
      '| expanded:',
      Array.from(expandedCategoriesRef.current),
      '| loaded:',
      loadedCategoryNames,
      '| loading:',
      loadingCategoryNames
    );
    limboCategories.forEach(categoryKey => {
      limboDispatchedRef.current.add(categoryKey);
      const item = keyToItem.get(categoryKey);
      fetchCategoryEmails(item?.name ?? categoryKey, item?.id ?? undefined)
        .catch(err => console.error(`[limbo-recovery] Error re-fetching category key "${categoryKey}":`, err)) // nosemgrep
        .finally(() => {
          limboDispatchedRef.current.delete(categoryKey);
        });
    });
  }, [
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
    fetchCategoryEmails,
    expandedCategoriesRef,
  ]);
}

/**
 * Manages category accordion expand/collapse state and prefetching.
 *
 * All state (expandedCategories, stableCategoryOrder) is keyed by category **key**,
 * not by name. The key is `categoryId ?? categoryName` — a UUID when available, so
 * expand/collapse and load-tracking are immune to category name encoding differences.
 *
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxCategoryAccordion({
  categorySummary,
  fetchCategoryEmails,
  loadedCategoryNames,
  loadingCategoryNames,
  exhaustedCategoryNames = [],
}: UseInboxCategoryAccordionParams) {
  // Both sets store category *keys* (UUID or name), not display names.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [stableCategoryOrder, setStableCategoryOrder] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);

  const loadedCategoryNamesRef = useRef(loadedCategoryNames);
  loadedCategoryNamesRef.current = loadedCategoryNames;
  const loadingCategoryNamesRef = useRef(loadingCategoryNames);
  loadingCategoryNamesRef.current = loadingCategoryNames;

  /** Toggle a category's expanded state by its category key (UUID or name). */
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

  /**
   * Set the ordered list of category keys.
   * On first call, also auto-expands the first INITIAL_PRELOAD_COUNT categories.
   */
  const updateStableCategoryOrder = useCallback((categoryKeys: string[]) => {
    if (categoryKeys.length > 0) {
      setStableCategoryOrder(categoryKeys);
      if (!hasAutoExpandedRef.current) {
        hasAutoExpandedRef.current = true;
        const autoExpand = new Set(categoryKeys.slice(0, INITIAL_PRELOAD_COUNT));
        devLog(
          '[Accordion] Auto-expanding first',
          INITIAL_PRELOAD_COUNT,
          'categories (keys):',
          Array.from(autoExpand)
        );
        setExpandedCategories(autoExpand);
      }
    }
  }, []);

  const resetForModeChange = useCallback(() => {
    devLog('[Accordion] resetForModeChange called — clearing expandedCategories and stableCategoryOrder');
    setStableCategoryOrder([]);
    setExpandedCategories(new Set());
    hasAutoExpandedRef.current = false;
  }, []);

  // Always keep a current ref to expandedCategories so limbo-recovery and summary-refetch
  // effects can read it without depending on it as a reactive dep.
  const expandedCategoriesRef = useRef(expandedCategories);
  expandedCategoriesRef.current = expandedCategories;

  // Effect: Auto-prune expanded categories whose count has dropped to 0 (or that have
  // been removed from the summary entirely). This handles both:
  //   - Archive All: optimistic decrement sets count=0 before component unmounts
  //   - Single last-email archive: count drops to 0 during animation delay
  // Without this, stale keys remain in expandedCategories so the accordion re-expands
  // next time the category reappears (e.g. after a summary refresh with new emails).
  useEffect(() => {
    if (!categorySummary) {
      return;
    }

    const validKeys = new Set(
      categorySummary.filter(cat => (cat.count ?? 1) > 0).map(cat => getCategoryKey(cat.id, cat.name))
    );

    setExpandedCategories(prev => {
      const next = new Set<string>();
      for (const key of prev) {
        if (validKeys.has(key)) {
          next.add(key);
        }
      }
      // Only trigger a re-render if something actually changed
      if (next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, [categorySummary]);

  // NOTE: Effect 3 (null → populated re-fetch) was removed — it is fully covered by
  // Effect 1. When categorySummary transitions null → non-null, Effect 1 fires because
  // categorySummary is in its dep array; it then re-fetches any expanded categories
  // that are neither loaded nor loading. Having Effect 3 as well caused a double-fetch.
  useCategoryFetchEffects({
    categorySummary,
    expandedCategories,
    expandedCategoriesRef,
    loadedCategoryNames,
    loadingCategoryNames,
    exhaustedCategoryNames,
    loadedCategoryNamesRef,
    loadingCategoryNamesRef,
    fetchCategoryEmails,
  });

  return {
    expandedCategories,
    setExpandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
    resetForModeChange,
  };
}
