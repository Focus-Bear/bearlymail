import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_NETWORK, ERROR_CODE_ERR_NETWORK, ERROR_GMAIL_REQUIRED, ERROR_GMAIL } from 'constants/strings';
import { InboxMode } from 'types/email';
import { API_URL } from 'config/api';
import { InboxFilter } from 'hooks/useInboxFilters';
import { AppDispatch } from 'store/store';
import {
  setEmails,
  appendEmails,
  setHasMore,
  setTotalCount,
  setCurrentOffset,
  setDecrypting,
  setLoading,
  setRefreshing,
  setLoadingModeSwitch,
  setFetchError,
  setCategorySummary,
  markCategoryLoaded,
  markCategoryLoading,
  clearCategoryState,
} from 'store/slices/emailSlice';
import { selectCurrentOffset, selectLoadedCategoryNames } from 'store/selectors/emailSelectors';

interface UseEmailFetchingProps {
  mode: InboxMode;
  filters?: InboxFilter;
}

// eslint-disable-next-line max-lines-per-function -- Inbox fetching requires summary, per-category lazy loading, and error handling
export function useEmailFetching({
  mode,
  filters,
}: UseEmailFetchingProps) {
  const dispatch = useDispatch<AppDispatch>();
  const currentOffset = useSelector(selectCurrentOffset);
  const loadedCategoryNames = useSelector(selectLoadedCategoryNames);
  // Prevent concurrent loadMore calls (background prefetch + scroll trigger)
  const isLoadingMoreRef = useRef(false);

  const buildSummaryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    params.append('mode', mode);

    if (filters) {
      if (filters.categories && filters.categories.length > 0) {
        params.append('categories', filters.categories.join(','));
      }
      if (filters.minPriority !== null && filters.minPriority !== undefined) {
        params.append('minPriority', filters.minPriority.toString());
      }
    }

    return params;
  }, [mode, filters]);

  const buildCategoryParams = useCallback((categoryName: string): URLSearchParams => {
    const params = new URLSearchParams();
    params.append('mode', mode);
    params.append('categories', categoryName);
    // Fetch all emails for this category in one request
    params.append('limit', '500');
    params.append('offset', '0');

    if (filters) {
      if (filters.accountIds && filters.accountIds.length > 0) {
        params.append('accounts', filters.accountIds.join(','));
      }
      if (filters.minPriority !== null && filters.minPriority !== undefined) {
        params.append('minPriority', filters.minPriority.toString());
      }
    }

    return params;
  }, [mode, filters]);

  /**
   * Fetch the inbox summary: category names and counts.
   * This replaces the old fetchEmails behaviour — accordions are rendered from the
   * summary immediately, then each category's emails are loaded lazily on expand.
   */
  const fetchEmails = useCallback(async () => {
    dispatch(setDecrypting(true));
    dispatch(setFetchError(null));
    // clearCategoryState sets summaryLoading = true internally, so no separate dispatch needed
    dispatch(clearCategoryState());
    dispatch(setEmails([]));
    dispatch(setCurrentOffset(0));
    dispatch(setHasMore(false));
    dispatch(setTotalCount(0));
    isLoadingMoreRef.current = false;
    try {
      const params = buildSummaryParams();

      const response = await axios.get(`${API_URL}/emails/inbox-summary?${params.toString()}`);
      const { total, categories } = response.data;
      console.log(`Fetched inbox summary: ${categories.length} categories, ${total} total emails for mode: ${mode}`);

      dispatch(setCategorySummary(categories));
      dispatch(setTotalCount(total));
      dispatch(setDecrypting(false));
      dispatch(setFetchError(null));
    } catch (error: any) {
      console.error('Error fetching inbox summary:', error);
      dispatch(setDecrypting(false));
      dispatch(setSummaryLoading(false));
      // eslint-disable-next-line no-restricted-syntax -- Error code comparison requires literal string for axios error codes
      if (error.code === ERROR_CODE_ERR_NETWORK || error.message?.includes(ERROR_NETWORK)) {
        dispatch(setFetchError('Unable to connect to the server. Please check if the server is running.'));
      } else if (error.response?.status === HTTP_UNAUTHORIZED) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes(ERROR_GMAIL_REQUIRED) || errorMessage.includes(ERROR_GMAIL)) {
          dispatch(setFetchError('GMAIL_REQUIRED'));
        } else {
          dispatch(setFetchError('Please log in again to view emails.'));
        }
      } else {
        dispatch(setFetchError(error.response?.data?.message || error.message || 'Failed to load emails. Please try again.'));
      }
    } finally {
      dispatch(setLoading(false));
      dispatch(setRefreshing(false));
      dispatch(setLoadingModeSwitch(false));
    }
  }, [mode, filters, dispatch, buildSummaryParams]);

  /**
   * Fetch emails for a specific category and append to the flat email list.
   * Called when the user expands a category accordion that hasn't been loaded yet.
   */
  const fetchCategoryEmails = useCallback(async (categoryName: string) => {
    if (loadedCategoryNames.includes(categoryName)) return;

    dispatch(markCategoryLoading(categoryName));
    try {
      const params = buildCategoryParams(categoryName);

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      const { emails } = response.data;
      console.log(`Fetched ${emails.length} emails for category: ${categoryName}`);

      dispatch(appendEmails(emails));
      dispatch(markCategoryLoaded(categoryName));
    } catch (error: any) {
      console.error(`Error fetching emails for category ${categoryName}:`, error);
      // Mark as loaded even on error to prevent infinite loading spinner
      dispatch(markCategoryLoaded(categoryName));
    }
  }, [mode, filters, dispatch, buildCategoryParams, loadedCategoryNames]);

  // loadMore is kept for backward compatibility but is now a no-op.
  // Category emails are loaded lazily via fetchCategoryEmails instead.
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      // no-op: use fetchCategoryEmails for per-category lazy loading
      void currentOffset;
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [currentOffset]);

  return { fetchEmails, loadMore, fetchCategoryEmails };
}
