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
  PARAM_CATEGORIES,
  PARAM_CATEGORY_IDS,
} from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';
import {
  selectCurrentOffset,
  selectLoadedCategoryNames,
  selectLoadingCategoryNames,
} from 'store/selectors/emailSelectors';
import {
  clearCategoryState,
  markCategoryLoaded,
  markCategoryLoadFailed,
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

/**
 * Compute the stable category key used as the canonical identifier throughout the client.
 * When a UUID is available we use it — it's immune to name encoding/whitespace differences.
 * Falls back to the human-readable name for categories without a UUID (e.g. "Other",
 * auto-responded categories).
 */
export function getCategoryKey(id: string | null | undefined, name: string): string {
  return id ?? name;
}

/**
 * Detect whether a category key is a UUID (v4-ish format).
 * Used internally to route API params: UUID keys use `categoryIds=`, name keys use `categories=`.
 */
function isUuidKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
}

async function fetchAutoRespondedEmails(
  dispatch: AppDispatch,
  buildAutoRespondedParams: () => URLSearchParams,
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>
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
  // Auto-responded categories have no UUID — key = name
  categorySummary.forEach(category => {
    dispatch(markCategoryLoaded(getCategoryKey(category.id, category.name)));
  });
}

async function fetchInboxSummary(dispatch: AppDispatch, buildSummaryParams: () => URLSearchParams): Promise<void> {
  const params = buildSummaryParams();
  const response = await axios.get(`${API_URL}/emails/inbox-summary?${params.toString()}`);
  const { total, categories } = response.data;
  dispatch(setCategorySummary(categories));
  dispatch(setTotalCount(total));
}

export function useEmailFetching({ mode, filters }: UseEmailFetchingProps) {
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

  const buildSummaryParams = useCallback(() => buildSummaryParamsImpl(mode, filters), [mode, filters]);
  const buildCategoryParams = useCallback(
    (categoryKey: string) => buildCategoryParamsImpl(mode, filters, categoryKey),
    [mode, filters]
  );
  const buildAutoRespondedParams = useCallback(() => buildAutoRespondedParamsImpl(filters), [filters]);
  const buildAutoRespondedSummary = useCallback((emails: Email[]) => buildAutoRespondedSummaryImpl(emails), []);

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

  /**
   * Fetch emails for a single category on accordion expand.
   * @param categoryName - Human-readable name (for display/logging only).
   * @param categoryId   - UUID from the summary API; used as the stable category key
   *                       when available, so name encoding issues don't affect lookups.
   */
  const fetchCategoryEmails = useCallback(
    async (categoryName: string, categoryId?: string | null) => {
      await fetchCategoryEmailsImpl({
        categoryName,
        categoryId,
        mode,
        dispatch,
        buildCategoryParams,
        loadedCategoryNamesRef,
        loadingCategoryNamesRef,
        fetchSessionRef,
      });
      // NOTE: loadedCategoryNames and loadingCategoryNames are read via refs, not deps.
    },
    [mode, dispatch, buildCategoryParams]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) {
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      void currentOffset;
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [currentOffset]);

  const refreshInPlace = useCallback(async () => {
    await refreshInPlaceImpl({
      mode,
      dispatch,
      buildSummaryParams,
      buildCategoryParams,
      buildAutoRespondedParams,
      buildAutoRespondedSummary,
      loadedCategoryNamesRef,
    });
  }, [mode, dispatch, buildSummaryParams, buildCategoryParams, buildAutoRespondedParams, buildAutoRespondedSummary]);

  return { fetchEmails, loadMore, fetchCategoryEmails, refreshInPlace };
}

/** Extracted: fetch emails for a single category on expand. */
async function fetchCategoryEmailsImpl({
  categoryName,
  categoryId,
  mode,
  dispatch,
  buildCategoryParams,
  loadedCategoryNamesRef,
  loadingCategoryNamesRef,
  fetchSessionRef,
}: {
  categoryName: string;
  categoryId?: string | null;
  mode: InboxMode;
  dispatch: AppDispatch;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  loadedCategoryNamesRef: React.MutableRefObject<string[]>;
  loadingCategoryNamesRef: React.MutableRefObject<string[]>;
  fetchSessionRef: React.MutableRefObject<number>;
}) {
  // Compute the stable key: UUID when available, name as fallback
  const categoryKey = getCategoryKey(categoryId, categoryName);

  if (loadedCategoryNamesRef.current.includes(categoryKey)) {
    return;
  }
  if (loadingCategoryNamesRef.current.includes(categoryKey)) {
    return;
  }
  if (mode === MODE_AUTORESPONDED) {
    return;
  }

  const sessionId = fetchSessionRef.current;
  dispatch(markCategoryLoading(categoryKey));
  console.log('[Accordion] Fetching category:', categoryName, '(key:', categoryKey, ')');

  try {
    const params = buildCategoryParams(categoryKey);
    const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
    // Emails now include category_id (UUID) from the server, so groupEmailsByCategory
    // keys by UUID directly. No normalization needed.
    const emails: Email[] = response.data.emails;

    if (fetchSessionRef.current !== sessionId) {
      console.log('[Accordion] Stale fetch discarded for category:', categoryName, '(session changed)');
      return;
    }
    dispatch(updateCategoryEmails({ categoryKey, emails }));
    dispatch(markCategoryLoaded(categoryKey));
    console.log(
      '[Accordion] Loaded category:',
      categoryName,
      '(key:',
      categoryKey,
      ')',
      emails.length,
      'emails'
    );
  } catch (error: any) {
    console.error('[Accordion] Failed to load category:', categoryName, '(key:', categoryKey, ')', error);
    // Use markCategoryLoadFailed so isLoaded stays false — the next expand will retry.
    // markCategoryLoaded would set isLoaded=true with no emails, causing CategorySection
    // to return null and the accordion section to vanish entirely.
    if (fetchSessionRef.current === sessionId) {
      console.warn('[Accordion] Category load failed, allowing retry:', categoryName);
      dispatch(markCategoryLoadFailed(categoryKey));
    }
  }
}

/** Extracted: refresh inbox in-place without clearing state. */
async function refreshInPlaceImpl({
  mode,
  dispatch,
  buildSummaryParams,
  buildCategoryParams,
  buildAutoRespondedParams,
  buildAutoRespondedSummary,
  loadedCategoryNamesRef,
}: {
  mode: InboxMode;
  dispatch: AppDispatch;
  buildSummaryParams: () => URLSearchParams;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  buildAutoRespondedParams: () => URLSearchParams;
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>;
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

  // loadedCategoryNamesRef now stores category keys (UUIDs or names).
  // buildCategoryParams handles both: UUID keys → categoryIds=, name keys → categories=
  const loadedCategoryKeys = [...loadedCategoryNamesRef.current];
  await Promise.all(
    loadedCategoryKeys.map(async categoryKey => {
      try {
        const catParams = buildCategoryParams(categoryKey);
        const catResponse = await axios.get(`${API_URL}/emails/inbox?${catParams.toString()}`);
        // Emails now include category_id (UUID) from the server; no normalization needed.
        const emails: Email[] = (catResponse.data as { emails: Email[] }).emails;
        dispatch(updateCategoryEmails({ categoryKey, emails }));
      } catch (err) {
        console.warn(`[refreshInPlace] Failed to refresh category key "${categoryKey}":`, err);
      }
    })
  );
}

function appendFilterParams(params: URLSearchParams, filters: InboxFilter | undefined): void {
  if (!filters) {
    return;
  }
  if (filters.categories?.length) {
    params.append(PARAM_CATEGORIES, filters.categories.join(','));
  }
  if (filters.minPriority !== null && filters.minPriority !== undefined) {
    params.append('minPriority', filters.minPriority.toString());
  }
  if (filters.accountIds?.length) {
    params.append('accounts', filters.accountIds.join(','));
  }
}

function buildSummaryParamsImpl(mode: InboxMode, filters?: InboxFilter): URLSearchParams {
  const params = new URLSearchParams();
  params.append('mode', mode);
  params.append('includeThreadIds', 'true');
  appendFilterParams(params, filters);
  return params;
}

/**
 * Build query params for a category email fetch.
 * When categoryKey is a UUID we use `categoryIds=` so the server resolves to the
 * canonical name — avoiding all URL-encoding and name-format fragility.
 * When categoryKey is a plain name (no UUID available) we fall back to `categories=`.
 */
function buildCategoryParamsImpl(
  mode: InboxMode,
  filters: InboxFilter | undefined,
  categoryKey: string
): URLSearchParams {
  const params = new URLSearchParams();
  params.append('mode', mode);
  if (isUuidKey(categoryKey)) {
    params.append(PARAM_CATEGORY_IDS, categoryKey);
  } else {
    params.append(PARAM_CATEGORIES, categoryKey);
  }
  params.append('limit', INBOX_FETCH_LIMIT.toString());
  params.append('offset', '0');
  if (filters) {
    if (filters.accountIds?.length) {
      params.append('accounts', filters.accountIds.join(','));
    }
    if (filters.minPriority !== null && filters.minPriority !== undefined) {
      params.append('minPriority', filters.minPriority.toString());
    }
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
  emails.forEach(email => {
    const name = email.category || CATEGORY_OTHER;
    categoryCounts.set(name, (categoryCounts.get(name) || 0) + 1);
  });
  return Array.from(categoryCounts.entries()).map(([name, count]) => ({ id: null, name, count }));
}

async function fetchEmailsImpl({
  mode,
  dispatch,
  buildSummaryParams,
  buildAutoRespondedParams,
  buildAutoRespondedSummary,
}: {
  mode: InboxMode;
  dispatch: AppDispatch;
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
    dispatch(
      setFetchError(
        msg.includes(ERROR_GMAIL_REQUIRED) || msg.includes(ERROR_GMAIL)
          ? 'GMAIL_REQUIRED'
          : 'Please log in again to view emails.'
      )
    );
  } else {
    dispatch(
      setFetchError(error.response?.data?.message || error.message || 'Failed to load emails. Please try again.')
    );
  }
}
