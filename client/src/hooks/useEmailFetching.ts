import React, { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';
import {
  getCachedCategoryEmails,
  getCachedSummary,
  setCachedCategoryEmails,
  setCachedSummary,
} from 'utils/emailCache';

import { API_URL } from 'config/api';
import {
  BACKOFF_RETRY_BUFFER_MS,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
  INBOX_FETCH_LIMIT,
  MAX_CATEGORY_FETCH_RETRIES,
  MS_PER_SECOND,
} from 'constants/numbers';
import {
  CATEGORY_OTHER,
  ERROR_CODE_ERR_NETWORK,
  ERROR_GMAIL,
  ERROR_GMAIL_REQUIRED,
  ERROR_NETWORK,
  MODE_AUTORESPONDED,
  MODE_SCHEDULED,
  PARAM_CATEGORIES,
  PARAM_CATEGORY_IDS,
} from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';
import { BackoffContext,usePollingWithBackoff } from 'hooks/usePollingWithBackoff';
import {
  selectCurrentOffset,
  selectLoadedCategoryNames,
  selectLoadingCategoryNames,
} from 'store/selectors/emailSelectors';
import {
  CategorySummaryItem,
  clearCategoryState,
  markCategoryFetchExhausted,
  markCategoryLoaded,
  markCategoryLoadFailed,
  markCategoryLoading,
  setCategorySummary,
  setCurrentOffset,
  setDecrypting,
  setEmails,
  setFetchError,
  setHasMore,
  setLastFetchedAt,
  setLoading,
  setLoadingModeSwitch,
  setRefreshing,
  setSummaryLoading,
  setTotalCount,
  updateCategoryEmails,
} from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

/** How long (ms) the inbox cache is considered fresh before a full re-fetch is needed. */
export const INBOX_CACHE_TTL_MS = 60_000;

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

async function fetchInboxSummary(
  dispatch: AppDispatch,
  buildSummaryParams: () => URLSearchParams
): Promise<CategorySummaryItem[] | null> {
  const params = buildSummaryParams();
  const response = await axios.get(`${API_URL}/emails/inbox-summary?${params.toString()}`);
  const { total, categories } = response.data;
  dispatch(setCategorySummary(categories));
  dispatch(setTotalCount(total));
  return categories ?? null;
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
  // Backoff circuit breaker for category fetches. Stored in refs (not useState) so that
  // backoff tracking never triggers a re-render, which would re-fire Effect 2.
  const categoryBackoff = usePollingWithBackoff({ maxRetries: MAX_CATEGORY_FETCH_RETRIES });
  // Timers used to schedule retry renders after the backoff window elapses
  const pendingRetryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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
        categoryBackoff,
        pendingRetryTimersRef,
      });
      // NOTE: loadedCategoryNames and loadingCategoryNames are read via refs, not deps.
    },
    // categoryBackoff is from usePollingWithBackoff — its functions are stable (useCallback with []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, dispatch, buildCategoryParams]
  );

  // Cleanup: cancel all pending retry timers on unmount
  useEffect(() => {
    const pendingTimers = pendingRetryTimersRef.current;
    return () => {
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
      categoryBackoff.cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

/** Populate Redux from the localStorage cache and kick off a silent background refresh. */
function serveCategoryFromCacheAndRefresh({
  cachedEmails,
  catKey,
  categoryName,
  mode,
  dispatch,
  buildCategoryParams,
  fetchSessionRef,
}: {
  cachedEmails: Email[];
  catKey: string;
  categoryName: string;
  mode: InboxMode;
  dispatch: AppDispatch;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  fetchSessionRef: React.MutableRefObject<number>;
}): void {
  dispatch(updateCategoryEmails({ categoryKey: catKey, emails: cachedEmails }));
  dispatch(markCategoryLoaded(catKey));

  const sessionId = fetchSessionRef.current;
  const params = buildCategoryParams(catKey);
  axios
    .get(`${API_URL}/emails/inbox?${params.toString()}`)
    .then(response => {
      if (fetchSessionRef.current !== sessionId) {
        return;
      }
      const freshEmails: Email[] = response.data.emails;
      dispatch(updateCategoryEmails({ categoryKey: catKey, emails: freshEmails }));
      setCachedCategoryEmails(mode, catKey, freshEmails);
    })
    .catch(err => console.warn('[Accordion] Background refresh failed for category:', categoryName, err));
}

/** Arguments shared between fetchCategoryEmailsImpl and handleCategoryFetchError. */
interface CategoryFetchArgs {
  categoryName: string;
  categoryId?: string | null;
  mode: InboxMode;
  dispatch: AppDispatch;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  loadedCategoryNamesRef: React.MutableRefObject<string[]>;
  loadingCategoryNamesRef: React.MutableRefObject<string[]>;
  fetchSessionRef: React.MutableRefObject<number>;
  categoryBackoff: BackoffContext;
  pendingRetryTimersRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>>;
}

/** Handles a failed category fetch: applies backoff state and schedules a retry timer. */
function handleCategoryFetchError(
  args: CategoryFetchArgs,
  catKey: string,
  error: any,
  sessionId: number
) {
  const { categoryName, categoryId, mode, dispatch, buildCategoryParams, loadedCategoryNamesRef, loadingCategoryNamesRef, fetchSessionRef, categoryBackoff, pendingRetryTimersRef } = args;
  console.error('[Accordion] Failed to load category:', categoryName, '(key:', catKey, ')', error);
  if (fetchSessionRef.current !== sessionId) {
return;
}

  const backoffState = categoryBackoff.onError(catKey, error);
  if (backoffState.exhausted) {
    dispatch(markCategoryFetchExhausted(catKey));
    console.error('[Accordion] Category fetch exhausted after', backoffState.retryCount, 'retries:', categoryName);
    return;
  }

  const is429 = error?.response?.status === HTTP_TOO_MANY_REQUESTS;
  const delayMs = Math.max(0, backoffState.nextAllowedAt - Date.now());
  console.warn(
    `[Accordion] Category load failed (${is429 ? '429' : 'error'}), retry ${backoffState.retryCount}/${MAX_CATEGORY_FETCH_RETRIES} in ${Math.round(delayMs / MS_PER_SECOND)}s:`,
    categoryName
  );
  dispatch(markCategoryLoadFailed(catKey));

  const retryTimer = setTimeout(() => {
    pendingRetryTimersRef.current.delete(retryTimer);
    fetchCategoryEmailsImpl({ categoryName, categoryId, mode, dispatch, buildCategoryParams, loadedCategoryNamesRef, loadingCategoryNamesRef, fetchSessionRef, categoryBackoff, pendingRetryTimersRef })
      .catch(err => console.error('[limbo-recovery] Backoff retry failed:', err));
  }, delayMs + BACKOFF_RETRY_BUFFER_MS);
  pendingRetryTimersRef.current.add(retryTimer);
}

/** Returns true if a category fetch should be skipped (already loaded, loading, wrong mode, or in backoff). */
function shouldSkipCategoryFetch(args: CategoryFetchArgs, catKey: string): boolean {
  const { mode, loadedCategoryNamesRef, loadingCategoryNamesRef, categoryBackoff } = args;
  return (
    loadedCategoryNamesRef.current.includes(catKey) ||
    loadingCategoryNamesRef.current.includes(catKey) ||
    mode === MODE_AUTORESPONDED ||
    categoryBackoff.shouldSkip(catKey)
  );
}

/** Extracted: fetch emails for a single category on expand. */
async function fetchCategoryEmailsImpl(args: CategoryFetchArgs) {
  const { categoryName, categoryId, mode, dispatch, buildCategoryParams, fetchSessionRef, categoryBackoff } = args;
  // Compute the stable key: UUID when available, name as fallback
  const catKey = getCategoryKey(categoryId, categoryName);

  // Early-exit: already loaded/loading, wrong mode, or in backoff/circuit-open state.
  if (shouldSkipCategoryFetch(args, catKey)) {
    return;
  }

  // Stale-while-revalidate for categories: show cached emails instantly, refresh in background
  const cachedEmails = getCachedCategoryEmails(mode, catKey);
  if (cachedEmails !== null) {
    serveCategoryFromCacheAndRefresh({ cachedEmails, catKey, categoryName, mode, dispatch, buildCategoryParams, fetchSessionRef });
    return;
  }

  const sessionId = fetchSessionRef.current;
  categoryBackoff.markInFlight(catKey);
  dispatch(markCategoryLoading(catKey));
  console.log('[Accordion] Fetching category:', categoryName, '(key:', catKey, ')');

  try {
    const params = buildCategoryParams(catKey);
    const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
    // Emails now include category_id (UUID) from the server, so groupEmailsByCategory
    // keys by UUID directly. No normalization needed.
    const emails: Email[] = response.data.emails;

    if (fetchSessionRef.current !== sessionId) {
      console.log('[Accordion] Stale fetch discarded for category:', categoryName, '(session changed)');
      return;
    }
    categoryBackoff.onSuccess(catKey);
    dispatch(updateCategoryEmails({ categoryKey: catKey, emails }));
    dispatch(markCategoryLoaded(catKey));
    setCachedCategoryEmails(mode, catKey, emails);
    console.log('[Accordion] Loaded category:', categoryName, '(key:', catKey, ')', emails.length, 'emails');
  } catch (error: any) {
    handleCategoryFetchError(args, catKey, error, sessionId);
  } finally {
    categoryBackoff.clearInFlight(catKey);
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
    const freshCategories = summaryResponse.data.categories;
    dispatch(setCategorySummary(freshCategories));
    dispatch(setTotalCount(summaryResponse.data.total));
    setCachedSummary(mode, freshCategories);
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
        setCachedCategoryEmails(mode, categoryKey, emails);
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

/** Populate Redux from cached summary and kick off a silent background refresh. */
function serveSummaryFromCacheAndRefresh({
  cachedSummary,
  mode,
  dispatch,
  buildSummaryParams,
}: {
  cachedSummary: CategorySummaryItem[];
  mode: InboxMode;
  dispatch: AppDispatch;
  buildSummaryParams: () => URLSearchParams;
}): void {
  dispatch(setFetchError(null));
  dispatch(clearCategoryState());
  dispatch(setEmails([]));
  dispatch(setCurrentOffset(0));
  dispatch(setHasMore(false));
  dispatch(setTotalCount(cachedSummary.reduce((sum, cat) => sum + cat.count, 0)));
  dispatch(setCategorySummary(cachedSummary));
  dispatch(setLoading(false));
  dispatch(setDecrypting(false));
  dispatch(setLastFetchedAt(Date.now()));
  fetchInboxSummary(dispatch, buildSummaryParams)
    .then(freshSummary => {
      if (freshSummary) {
        setCachedSummary(mode, freshSummary);
      }
    })
    .catch(err => console.warn('[fetchEmails] Background refresh failed:', err));
}

/** Reset inbox state before a full (non-cache) fetch. */
function dispatchFetchStart(dispatch: AppDispatch) {
  dispatch(setDecrypting(true));
  dispatch(setFetchError(null));
  dispatch(clearCategoryState());
  dispatch(setEmails([]));
  dispatch(setCurrentOffset(0));
  dispatch(setHasMore(false));
  dispatch(setTotalCount(0));
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
  // Stale-while-revalidate: if we have cached summary data, serve it immediately (no spinner),
  // then refresh in the background. This makes inbox navigation feel instant.
  const cachedSummary = mode !== MODE_AUTORESPONDED ? getCachedSummary(mode) : null;
  const hasCachedData = cachedSummary !== null && cachedSummary.length > 0;

  if (hasCachedData) {
    serveSummaryFromCacheAndRefresh({ cachedSummary, mode, dispatch, buildSummaryParams });
    return;
  }

  // No cache — full fetch with loading indicator
  dispatchFetchStart(dispatch);
  try {
    if (mode === MODE_AUTORESPONDED) {
      await fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary);
    } else if (mode === MODE_SCHEDULED) {
      // Scheduled emails are managed by ScheduledEmailsManager, not the inbox email slice.
      // Nothing to fetch here; clear loading state so the panel renders immediately.
      dispatch(setDecrypting(false));
      dispatch(setLoading(false));
      dispatch(setLoadingModeSwitch(false));
      return;
    } else {
      const freshSummary = await fetchInboxSummary(dispatch, buildSummaryParams);
      if (freshSummary) {
        setCachedSummary(mode, freshSummary);
      }
    }
    dispatch(setDecrypting(false));
    dispatch(setFetchError(null));
    dispatch(setLastFetchedAt(Date.now()));
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
