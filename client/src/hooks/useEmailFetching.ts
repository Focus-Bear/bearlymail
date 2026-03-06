import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED, INBOX_FETCH_LIMIT } from 'constants/numbers';
import {
  CATEGORY_OTHER,
  ERROR_CODE_ERR_NETWORK,
  ERROR_GMAIL,
  ERROR_GMAIL_REQUIRED,
  ERROR_NETWORK,
  MODE_AUTORESPONDED,
} from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';
import { selectCurrentOffset, selectLoadedCategoryNames, selectLoadingCategoryNames } from 'store/selectors/emailSelectors';
import {
  clearCategoryState,
  markCategoryLoaded,
  markCategoryLoading,
  setCategorySummary,
  setCurrentOffset,
  setDecrypting,
  setEmails,
  setFetchError,
  setHasMore,
  setLoading,
  setLoadingModeSwitch,
  setRefreshing,
  setSummaryLoading,
  setTotalCount,
  updateCategoryEmails,
} from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

interface UseEmailFetchingProps {
  mode: InboxMode;
  filters?: InboxFilter;
}

async function fetchAutoRespondedEmails(
  dispatch: AppDispatch,
  buildAutoRespondedParams: () => URLSearchParams,
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>,
): Promise<void> {
  const params = buildAutoRespondedParams();
  const response = await axios.get(`${API_URL}/auto-responder/threads?${params.toString()}`);
  const { emails = [], total = 0, hasMore = false } = response.data;

  const normalizedEmails: Email[] = emails.map((email: Email) => ({
    ...email,
    category: email.category || CATEGORY_OTHER,
  }));
  const categorySummary = buildAutoRespondedSummary(normalizedEmails);

  dispatch(setEmails(normalizedEmails));
  dispatch(setCategorySummary(categorySummary));
  dispatch(setTotalCount(total));
  dispatch(setHasMore(hasMore));
  dispatch(setCurrentOffset(normalizedEmails.length));
  categorySummary.forEach((category) => {
    dispatch(markCategoryLoaded(category.name));
  });
}

async function fetchInboxSummary(
  dispatch: AppDispatch,
  buildSummaryParams: () => URLSearchParams,
): Promise<void> {
  const params = buildSummaryParams();
  const response = await axios.get(`${API_URL}/emails/inbox-summary?${params.toString()}`);
  const { total, categories } = response.data;
  dispatch(setCategorySummary(categories));
  dispatch(setTotalCount(total));
}

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

  const buildSummaryParams = useCallback(
    () => buildSummaryParamsImpl(mode, filters), [mode, filters],
  );
  const buildCategoryParams = useCallback(
    (categoryName: string, categoryId?: string | null) => buildCategoryParamsImpl(mode, filters, categoryName, categoryId), [mode, filters],
  );
  const buildAutoRespondedParams = useCallback(
    () => buildAutoRespondedParamsImpl(filters), [filters],
  );
  const buildAutoRespondedSummary = useCallback(
    (emails: Email[]) => buildAutoRespondedSummaryImpl(emails), [],
  );

  /**
   * Fetch the inbox summary: category names and counts.
   * This replaces the old fetchEmails behaviour — accordions are rendered from the
   * summary immediately, then each category's emails are loaded lazily on expand.
   */
  const fetchEmails = useCallback(async () => {
    fetchSessionRef.current += 1;
    isLoadingMoreRef.current = false;
    await fetchEmailsImpl({ mode, dispatch, buildSummaryParams, buildAutoRespondedParams, buildAutoRespondedSummary });
  }, [mode, dispatch, buildSummaryParams, buildAutoRespondedParams, buildAutoRespondedSummary]);
  const fetchCategoryEmails = useCallback(async (categoryName: string, categoryId?: string | null) => {
    await fetchCategoryEmailsImpl({
      categoryName, categoryId, mode, dispatch, buildCategoryParams,
      loadedCategoryNamesRef, loadingCategoryNamesRef, fetchSessionRef,
    });
  // NOTE: loadedCategoryNames and loadingCategoryNames are read via refs, not deps.
  }, [mode, dispatch, buildCategoryParams]);

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    try { void currentOffset; } finally { isLoadingMoreRef.current = false; }
  }, [currentOffset]);

  const refreshInPlace = useCallback(async () => {
    await refreshInPlaceImpl({
      mode, dispatch, buildSummaryParams, buildCategoryParams,
      buildAutoRespondedParams, buildAutoRespondedSummary, loadedCategoryNamesRef,
    });
  }, [mode, dispatch, buildSummaryParams, buildCategoryParams, buildAutoRespondedParams, buildAutoRespondedSummary]);

  return { fetchEmails, loadMore, fetchCategoryEmails, refreshInPlace };
}

/** Extracted: fetch emails for a single category on expand. */
async function fetchCategoryEmailsImpl({ categoryName, categoryId, mode, dispatch, buildCategoryParams, loadedCategoryNamesRef, loadingCategoryNamesRef, fetchSessionRef }: {
  categoryName: string; categoryId?: string | null; mode: InboxMode; dispatch: AppDispatch;
  buildCategoryParams: (name: string, id?: string | null) => URLSearchParams;
  loadedCategoryNamesRef: React.MutableRefObject<string[]>; loadingCategoryNamesRef: React.MutableRefObject<string[]>;
  fetchSessionRef: React.MutableRefObject<number>;
}) {
  if (loadedCategoryNamesRef.current.includes(categoryName)) return;
  if (loadingCategoryNamesRef.current.includes(categoryName)) return;
  if (mode === MODE_AUTORESPONDED) return;

  const sessionId = fetchSessionRef.current;
  dispatch(markCategoryLoading(categoryName));

  try {
    const params = buildCategoryParams(categoryName, categoryId);
    const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
    const normalizedEmails = normalizeCategoryEmails(response.data.emails, categoryName);
    if (fetchSessionRef.current !== sessionId) return;
    dispatch(updateCategoryEmails({ categoryName, emails: normalizedEmails }));
    dispatch(markCategoryLoaded(categoryName));
  } catch (error: any) {
    console.error(`Error fetching category "${categoryName}":`, error);
    if (fetchSessionRef.current === sessionId) dispatch(markCategoryLoaded(categoryName));
  }
}

function normalizeCategoryEmails(emails: any[], categoryName: string) {
  return emails.map((email: any) => (!email.category || email.category !== categoryName) ? { ...email, category: categoryName } : email);
}

/** Extracted: refresh inbox in-place without clearing state. */
async function refreshInPlaceImpl({ mode, dispatch, buildSummaryParams, buildCategoryParams, buildAutoRespondedParams, buildAutoRespondedSummary, loadedCategoryNamesRef }: {
  mode: InboxMode; dispatch: AppDispatch;
  buildSummaryParams: () => URLSearchParams; buildCategoryParams: (name: string) => URLSearchParams;
  buildAutoRespondedParams: () => URLSearchParams; buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>;
  loadedCategoryNamesRef: React.MutableRefObject<string[]>;
}) {
  if (mode === MODE_AUTORESPONDED) {
    try {
      await fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary);
    } catch (err) {
      console.warn('[refreshInPlace] Autoresponded refresh failed:', err);
    }
    return;
  }

  try {
    const summaryParams = buildSummaryParams();
    const summaryResponse = await axios.get(`${API_URL}/emails/inbox-summary?${summaryParams.toString()}`);
    dispatch(setCategorySummary(summaryResponse.data.categories));
    dispatch(setTotalCount(summaryResponse.data.total));
  } catch (err) {
    console.warn('[refreshInPlace] Summary fetch failed:', err);
    return;
  }

  const loadedCategories = [...loadedCategoryNamesRef.current];
  await Promise.all(loadedCategories.map(async (categoryName) => {
    try {
      const catParams = buildCategoryParams(categoryName);
      const catResponse = await axios.get(`${API_URL}/emails/inbox?${catParams.toString()}`);
      const normalizedEmails = normalizeCategoryEmails((catResponse.data as { emails: Email[] }).emails, categoryName);
      dispatch(updateCategoryEmails({ categoryName, emails: normalizedEmails }));
    } catch (err) {
      console.warn(`[refreshInPlace] Failed to refresh "${categoryName}":`, err);
    }
  }));
}

function appendFilterParams(params: URLSearchParams, filters: InboxFilter | undefined): void {
  if (!filters) return;
  if (filters.categories?.length) params.append('categories', filters.categories.join(','));
  if (filters.minPriority !== null && filters.minPriority !== undefined) params.append('minPriority', filters.minPriority.toString());
  if (filters.accountIds?.length) params.append('accounts', filters.accountIds.join(','));
}

function buildSummaryParamsImpl(mode: InboxMode, filters?: InboxFilter): URLSearchParams {
  const params = new URLSearchParams();
  params.append('mode', mode);
  params.append('includeThreadIds', 'true');
  appendFilterParams(params, filters);
  return params;
}

function buildCategoryParamsImpl(mode: InboxMode, filters: InboxFilter | undefined, categoryName: string, categoryId?: string | null): URLSearchParams {
  const params = new URLSearchParams();
  params.append('mode', mode);
  if (categoryId) { params.append('categoryIds', categoryId); } else { params.append('categories', categoryName); }
  params.append('limit', INBOX_FETCH_LIMIT.toString());
  params.append('offset', '0');
  if (filters) {
    if (filters.accountIds?.length) params.append('accounts', filters.accountIds.join(','));
    if (filters.minPriority !== null && filters.minPriority !== undefined) params.append('minPriority', filters.minPriority.toString());
  }
  return params;
}

function buildAutoRespondedParamsImpl(filters?: InboxFilter): URLSearchParams {
  const params = new URLSearchParams();
  params.append('offset', '0');
  params.append('limit', INBOX_FETCH_LIMIT.toString());
  appendFilterParams(params, filters);
  return params;
}

function buildAutoRespondedSummaryImpl(emails: Email[]): Array<{ id: null; name: string; count: number }> {
  const categoryCounts = new Map<string, number>();
  emails.forEach((email) => {
    const name = email.category || CATEGORY_OTHER;
    categoryCounts.set(name, (categoryCounts.get(name) || 0) + 1);
  });
  return Array.from(categoryCounts.entries()).map(([name, count]) => ({ id: null, name, count }));
}

async function fetchEmailsImpl({ mode, dispatch, buildSummaryParams, buildAutoRespondedParams, buildAutoRespondedSummary }: {
  mode: InboxMode; dispatch: AppDispatch;
  buildSummaryParams: () => URLSearchParams;
  buildAutoRespondedParams: () => URLSearchParams;
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>;
}) {
  dispatch(setDecrypting(true));
  dispatch(setFetchError(null));
  dispatch(clearCategoryState());
  dispatch(setEmails([]));
  dispatch(setCurrentOffset(0));
  dispatch(setHasMore(false));
  dispatch(setTotalCount(0));
  try {
    if (mode === MODE_AUTORESPONDED) {
      await fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary);
    } else {
      await fetchInboxSummary(dispatch, buildSummaryParams);
    }
    dispatch(setDecrypting(false));
    dispatch(setFetchError(null));
  } catch (error: any) {
    dispatch(setDecrypting(false));
    dispatch(setSummaryLoading(false));
    handleFetchError(dispatch, error);
  } finally {
    dispatch(setLoading(false));
    dispatch(setRefreshing(false));
    dispatch(setLoadingModeSwitch(false));
  }
}

function handleFetchError(dispatch: AppDispatch, error: any) {
  if (error.code === ERROR_CODE_ERR_NETWORK || error.message?.includes(ERROR_NETWORK)) {
    dispatch(setFetchError('Unable to connect to the server. Please check if the server is running.'));
  } else if (error.response?.status === HTTP_UNAUTHORIZED) {
    const msg = error.response?.data?.message || '';
    dispatch(setFetchError(msg.includes(ERROR_GMAIL_REQUIRED) || msg.includes(ERROR_GMAIL) ? 'GMAIL_REQUIRED' : 'Please log in again to view emails.'));
  } else {
    dispatch(setFetchError(error.response?.data?.message || error.message || 'Failed to load emails. Please try again.'));
  }
}
