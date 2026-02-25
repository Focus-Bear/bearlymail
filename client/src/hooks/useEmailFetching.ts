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
  updateCategoryEmails,
  setHasMore,
  setTotalCount,
  setCurrentOffset,
  setDecrypting,
  setLoading,
  setRefreshing,
  setLoadingModeSwitch,
  setFetchError,
  setCategorySummary,
  setSummaryLoading,
  markCategoryLoaded,
  markCategoryLoading,
  clearCategoryState,
} from 'store/slices/emailSlice';
import { selectCurrentOffset, selectLoadedCategoryNames, selectLoadingCategoryNames } from 'store/selectors/emailSelectors';

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
  // Subscribe to both loaded and loading state for internal guards in fetchCategoryEmails.
  // We use refs so that fetchCategoryEmails doesn't need these as useCallback deps —
  // keeping fetchCategoryEmails stable prevents cascading re-runs of the re-fetch effect
  // in useInboxState every time a category finishes loading.
  const loadedCategoryNames = useSelector(selectLoadedCategoryNames);
  const loadingCategoryNames = useSelector(selectLoadingCategoryNames);
  const loadedCategoryNamesRef = useRef<string[]>(loadedCategoryNames);
  loadedCategoryNamesRef.current = loadedCategoryNames;
  const loadingCategoryNamesRef = useRef<string[]>(loadingCategoryNames);
  loadingCategoryNamesRef.current = loadingCategoryNames;
  // Prevent concurrent loadMore calls (background prefetch + scroll trigger)
  const isLoadingMoreRef = useRef(false);
  // Incremented each time fetchEmails() is called. fetchCategoryEmails captures the current
  // session ID and abandons its results if the session changed while the API call was in flight.
  // This prevents a stale fetchCategoryEmails from marking a category as "loaded" after
  // fetchEmails() cleared the state, which would block a subsequent re-fetch via the guard.
  const fetchSessionRef = useRef(0);

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
    // Increment session to invalidate any in-flight fetchCategoryEmails calls from a prior cycle.
    // Without this, a stale fetchCategoryEmails could dispatch markCategoryLoaded AFTER we
    // cleared the state, poisoning the guard and preventing a correct re-fetch.
    fetchSessionRef.current += 1;
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
      dispatch(setCategorySummary(categories));
      dispatch(setTotalCount(total));
      dispatch(setDecrypting(false));
      dispatch(setFetchError(null));
    } catch (error: any) {
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
   *
   * Uses refs for loadedCategoryNames and loadingCategoryNames so this callback stays
   * STABLE across category loads. This is critical: if loadedCategoryNames were in the
   * dep array, every category load would create a new fetchCategoryEmails reference,
   * which would trigger the re-fetch effect in useInboxState, causing cascading effect
   * re-runs that can leave categories stuck or fetch them multiple times.
   *
   * Session-based invalidation: each fetchEmails() call increments fetchSessionRef.current.
   * We capture the session ID at the start of this call and abandon results if the session
   * changed while the API request was in-flight (i.e. fetchEmails() was called concurrently).
   * This prevents a stale fetch from dispatching markCategoryLoaded() after clearCategoryState()
   * cleared loadedCategoryNames, which would block the correct re-fetch via the guard.
   */
  const fetchCategoryEmails = useCallback(async (categoryName: string) => {
    // Use refs (updated every render) instead of closed-over state values.
    // This prevents stale reads without making loadedCategoryNames a dep.
    if (loadedCategoryNamesRef.current.includes(categoryName)) {
      return;
    }
    if (loadingCategoryNamesRef.current.includes(categoryName)) {
      return;
    }

    // Capture session ID before any async work
    const sessionId = fetchSessionRef.current;

    dispatch(markCategoryLoading(categoryName));
    try {
      const params = buildCategoryParams(categoryName);

      const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
      const { emails } = response.data;

      // Discard results if fetchEmails() was called while this request was in-flight.
      // A stale result dispatching markCategoryLoaded() would poison the guard and
      // prevent a correct re-fetch in the new session.
      if (fetchSessionRef.current !== sessionId) {
        return;
      }

      dispatch(appendEmails(emails));
      dispatch(markCategoryLoaded(categoryName));
    } catch (error: any) {
      console.error(`Error fetching category "${categoryName}":`, error);
      // Only mark as loaded if still the current session — otherwise clearCategoryState()
      // already cleaned up loadingCategoryNames and a re-fetch will be triggered correctly.
      if (fetchSessionRef.current === sessionId) {
        dispatch(markCategoryLoaded(categoryName));
      }
    }
  // NOTE: loadedCategoryNames and loadingCategoryNames are intentionally NOT in deps.
  // They are read via refs (loadedCategoryNamesRef, loadingCategoryNamesRef) which are
  // always current. Keeping them out of deps makes this callback stable across category
  // loads, which prevents the cascading re-fetch effect runs that caused the bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters, dispatch, buildCategoryParams]);

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

  /**
   * Refresh inbox data in-place without wiping existing state.
   *
   * Unlike fetchEmails() — which clears all emails and category state before reloading —
   * this function quietly updates:
   *   1. The category summary (counts)
   *   2. The email list for every already-loaded category
   *
   * No loading spinners are shown and no existing data is removed until the fresh data
   * arrives. This makes it safe to call from background polling without causing a visible
   * reload of the inbox.
   *
   * Only loaded categories are refreshed. Categories the user has not yet expanded are
   * left untouched; their summary counts will be updated in step 1.
   */
  const refreshInPlace = useCallback(async () => {
    try {
      // Step 1: Silently update the summary (category names + counts)
      const summaryParams = buildSummaryParams();
      const summaryResponse = await axios.get(`${API_URL}/emails/inbox-summary?${summaryParams.toString()}`);
      const { total, categories } = summaryResponse.data;
      dispatch(setCategorySummary(categories));
      dispatch(setTotalCount(total));
    } catch (err) {
      // If the summary fetch fails, bail out — no point refreshing category emails
      console.warn('[refreshInPlace] Summary fetch failed, skipping category refresh:', err);
      return;
    }

    // Step 2: Re-fetch emails for each category that has already been loaded.
    // We read the snapshot of loaded categories at the start; new categories that
    // finish loading during this refresh cycle will not be double-fetched.
    const loadedCategories = [...loadedCategoryNamesRef.current];
    await Promise.all(
      loadedCategories.map(async (categoryName) => {
        try {
          const catParams = buildCategoryParams(categoryName);
          const catResponse = await axios.get(`${API_URL}/emails/inbox?${catParams.toString()}`);
          dispatch(updateCategoryEmails({ categoryName, emails: catResponse.data.emails }));
        } catch (err) {
          console.warn(`[refreshInPlace] Failed to refresh category "${categoryName}":`, err);
        }
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, buildSummaryParams, buildCategoryParams]);

  return { fetchEmails, loadMore, fetchCategoryEmails, refreshInPlace };
}
