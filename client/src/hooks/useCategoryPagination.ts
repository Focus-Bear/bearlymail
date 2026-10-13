import { useCallback, useContext, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { CATEGORY_PAGE_SIZE, INBOX_FETCH_LIMIT } from 'constants/numbers';
import { InboxFiltersContext, InboxFiltersValue } from 'contexts/InboxContext';
import { buildCategoryParamsImpl, CategoryInboxResponse, CategoryPageRequest, toCategoryPage } from 'hooks/useEmailFetching';
import { InboxFilter } from 'hooks/useInboxFilters';
import { appendCategoryEmails, CategoryPage, setCategoryPagination } from 'store/slices/inboxDataSlice';
import { AppDispatch, RootState } from 'store/store';

interface UseCategoryPaginationParams {
  mode: InboxMode;
  categoryKey: string;
  /** Rows of this category currently loaded — the offset of the next page. */
  loadedCount: number;
}

export interface CategoryPagination {
  /** True when the category has rows beyond those loaded. */
  hasMore: boolean;
  /** How many rows are not loaded yet (0 when everything is loaded). */
  remainingCount: number;
  isLoadingMore: boolean;
  /** Load the next CATEGORY_PAGE_SIZE rows. Concurrent calls collapse into one request. */
  loadMore: () => Promise<void>;
  /** IDs of the rows not loaded yet, for actions that must cover the whole category (Archive All). */
  fetchUnloadedIds: () => Promise<string[]>;
}

async function fetchCategoryPage(
  mode: InboxMode,
  filters: InboxFilter | undefined,
  categoryKey: string,
  page: CategoryPageRequest
): Promise<CategoryInboxResponse> {
  const params = buildCategoryParamsImpl(mode, filters, categoryKey, page);
  const response = await axios.get<CategoryInboxResponse>(`${API_URL}/emails/inbox?${params.toString()}`);
  return response.data;
}

/** Number of rows a category has beyond those loaded, per its last server page. */
export function countUnloadedRows(page: CategoryPage | undefined, loadedCount: number): number {
  if (!page?.hasMore) {
    return 0;
  }
  return Math.max(0, page.total - loadedCount);
}

/**
 * Paging for one category accordion. Categories load CATEGORY_PAGE_SIZE rows at a time;
 * this exposes the "Show more" action and lets whole-category actions fetch the rows
 * that are not on screen yet.
 */
export function useCategoryPagination({ mode, categoryKey, loadedCount }: UseCategoryPaginationParams): CategoryPagination {
  const dispatch = useDispatch<AppDispatch>();
  const page = useSelector((state: RootState) => state.inboxData.categoryPagination[categoryKey]);
  // Read without the throwing accessor: the accordion is also rendered outside InboxProvider
  // (stories, tests), where no filters apply.
  const filtersContext = useContext(InboxFiltersContext) as InboxFiltersValue | null;
  const filters = filtersContext?.inboxFilters.filters;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) {
      return;
    }
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const response = await fetchCategoryPage(mode, filters, categoryKey, {
        offset: loadedCount,
        limit: CATEGORY_PAGE_SIZE,
      });
      dispatch(appendCategoryEmails({ categoryKey, emails: response.emails }));
      dispatch(setCategoryPagination({ categoryKey, ...toCategoryPage(response) }));
    } catch (err) {
      console.warn('[Accordion] Failed to load more emails for category:', categoryKey, err); // nosemgrep
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [mode, filters, categoryKey, loadedCount, dispatch]);

  const hasMore = page?.hasMore ?? false;

  const fetchUnloadedIds = useCallback(async (): Promise<string[]> => {
    if (!hasMore) {
      return [];
    }
    const response = await fetchCategoryPage(mode, filters, categoryKey, {
      offset: loadedCount,
      limit: INBOX_FETCH_LIMIT,
    });
    return response.emails.map(email => email.id);
  }, [hasMore, mode, filters, categoryKey, loadedCount]);

  return {
    hasMore,
    remainingCount: countUnloadedRows(page, loadedCount),
    isLoadingMore,
    loadMore,
    fetchUnloadedIds,
  };
}
