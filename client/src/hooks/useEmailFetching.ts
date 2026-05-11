import React, { useCallback, useEffect, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';
import { devLog } from 'utils/dev-logger';
import {
  clearCacheForMode,
  filterHash,
  getCachedCategoryEmails,
  getCachedSummary,
  setCachedCategoryEmails,
  setCachedSummary,
} from 'utils/emailCache';
import { getAxiosErrorMessage } from 'utils/errors';

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
  PARAM_CATEGORY_IDS,
} from 'constants/strings';
import { InboxFilter } from 'hooks/useInboxFilters';
import { BackoffContext, usePollingWithBackoff } from 'hooks/usePollingWithBackoff';
import {
  selectCategorySummary,
  selectCurrentOffset,
  selectLoadedCategoryNames,
  selectLoadingCategoryNames,
} from 'store/selectors/emailSelectors';
import {
  CategorySummaryItem,
  clearCategoryState,
  clearCategorySummaryCount,
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

const ABORT_ERROR_NAME = 'AbortError';

/** How long (ms) the inbox cache is considered fresh before a full re-fetch is needed. */
export const INBOX_CACHE_TTL_MS = 60_000;

interface UseEmailFetchingProps {
  mode: InboxMode;
  filters?: InboxFilter;
}

/**
 * Compute the stable category key used as the canonical identifier throughout the client.
 * Always returns the UUID when present, or the constant "uncategorized" string.
 * NEVER falls back to the name — name-based keys are gone.
 */
export function getCategoryKey(id: string | null | undefined, _name?: string): string {
  return id ?? 'uncategorized';
}

async function fetchAutoRespondedEmails(
  dispatch: AppDispatch,
  buildAutoRespondedParams: () => URLSearchParams,
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>,
  signal?: AbortSignal
): Promise<void> {
  const params = buildAutoRespondedParams();
  const response = await axios.get(`${API_URL}/auto-responder/threads?${params.toString()}`, { signal });
  const { emails = [], total = 0, hasMore = false } = response.data;

  const normalizedEmails: Email[] = emails.map((email: Email) => ({
    ...email,
    category: email.category || CATEGORY_OTHER,
  }));
  const categorySummary = buildAutoRespondedSummary(normalizedEmails);

  dispatch(setEmails(normalizedEmails));
  dispatch(setCategorySummary(categorySummary));
  dispatch(setSummaryLoading(false));
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
  buildSummaryParams: () => URLSearchParams,
  signal?: AbortSignal
): Promise<CategorySummaryItem[] | null> {
  const params = buildSummaryParams();
  const response = await axios.get(`${API_URL}/emails/inbox-summary?${params.toString()}`, { signal });
  const { total, categories } = response.data;
  dispatch(setCategorySummary(categories));
  dispatch(setSummaryLoading(false));
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
  const categorySummary = useSelector(selectCategorySummary);
  const loadedCategoryNamesRef = useRef<string[]>(loadedCategoryNames);
  loadedCategoryNamesRef.current = loadedCategoryNames;
  const loadingCategoryNamesRef = useRef<string[]>(loadingCategoryNames);
  loadingCategoryNamesRef.current = loadingCategoryNames;
  const categorySummaryRef = useRef<CategorySummaryItem[] | null>(categorySummary);
  categorySummaryRef.current = categorySummary;
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

  const buildSummaryParams = useCallback(
    (overrideFilters?: Partial<InboxFilter>) =>
      buildSummaryParamsImpl(mode, overrideFilters ? ({ ...filters, ...overrideFilters } as InboxFilter) : filters),
    [mode, filters]
  );
  const buildCategoryParams = useCallback(
    (categoryKey: string) => buildCategoryParamsImpl(mode, filters, categoryKey),
    [mode, filters]
  );
  const buildAutoRespondedParams = useCallback(
    (overrideFilters?: Partial<InboxFilter>) =>
      buildAutoRespondedParamsImpl(overrideFilters ? ({ ...filters, ...overrideFilters } as InboxFilter) : filters),
    [filters]
  );
  const buildAutoRespondedSummary = useCallback((emails: Email[]) => buildAutoRespondedSummaryImpl(emails), []);

  /**
   * Fetch the inbox summary: category names and counts.
   * This replaces the old fetchEmails behaviour — accordions are rendered from the
   * summary immediately, then each category's emails are loaded lazily on expand.
   *
   * @param overrideFilters - Optional filter overrides to apply immediately, bypassing the
   *   stale-closure problem where React state updates are async but fetchEmails fires
   *   synchronously in the same tick as setPriorityFilter/setAccountFilter/setCategoryFilter.
   *   Pass the new filter values directly so the API call uses them without waiting for
   *   the next render cycle. Fixes: #1165 (stale closure sends wrong minPriority).
   */
  const fetchEmails = useCallback(
    async (signalOrOverride?: AbortSignal | Partial<InboxFilter>, overrideFilters?: Partial<InboxFilter>) => {
      // Support two call signatures:
      //   fetchEmails(signal?)                      — called by useInboxInitialization with an AbortSignal
      //   fetchEmails(overrideFilters?)             — called internally with filter overrides
      const signal = signalOrOverride instanceof AbortSignal ? signalOrOverride : undefined;
      const effectiveOverride = signalOrOverride instanceof AbortSignal ? overrideFilters : signalOrOverride;

      fetchSessionRef.current += 1;
      isLoadingMoreRef.current = false;
      // Fix #846: when filters change, the cached summary and per-category emails are stale
      // by definition (they were fetched with different filter params). Invalidate all cached
      // data for this mode so fetchEmailsImpl always hits the network with the new filter
      // values instead of serving wrong data from the stale-while-revalidate cache.
      if (effectiveOverride) {
        clearCacheForMode(mode);
      }
      const effectiveFilters = effectiveOverride ? ({ ...filters, ...effectiveOverride } as InboxFilter) : filters;
      const buildSummaryParamsWithOverride = () => buildSummaryParamsImpl(mode, effectiveFilters);
      const buildAutoRespondedParamsWithOverride = () => buildAutoRespondedParamsImpl(effectiveFilters);
      await fetchEmailsImpl({
        mode,
        dispatch,
        filters: effectiveFilters,
        buildSummaryParams: buildSummaryParamsWithOverride,
        buildAutoRespondedParams: buildAutoRespondedParamsWithOverride,
        buildAutoRespondedSummary,
        // Fix #1571 Bug 1: pass effective filters so the cache key is scoped to the filter hash.
        activeFilters: effectiveFilters,
        signal,
      });
    },
    [mode, dispatch, filters, buildAutoRespondedSummary]
  );

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
        categorySummaryRef,
      });
      // NOTE: loadedCategoryNames and loadingCategoryNames are read via refs, not deps.
    },
    // categoryBackoff functions are stable (useCallback with []); including them satisfies the rule without causing re-renders.
    [mode, dispatch, buildCategoryParams, categoryBackoff]
  );

  // Cleanup: cancel all pending retry timers on unmount
  useEffect(() => {
    const pendingTimers = pendingRetryTimersRef.current;
    return () => {
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
      categoryBackoff.cancelAll();
    };
  }, [categoryBackoff]); // categoryBackoff.cancelAll is stable (useCallback with []); including it satisfies the rule

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

  const refreshInPlace = useCallback(
    async (signal?: AbortSignal) => {
      await refreshInPlaceImpl({
        mode,
        dispatch,
        filters,
        buildSummaryParams,
        buildCategoryParams,
        buildAutoRespondedParams,
        buildAutoRespondedSummary,
        loadedCategoryNamesRef,
        // Fix #1571 Bug 1: pass current filters so cache write-back is scoped to filter hash.
        activeFilters: filters,
        signal,
      });
    },
    [
      mode,
      dispatch,
      filters,
      buildSummaryParams,
      buildCategoryParams,
      buildAutoRespondedParams,
      buildAutoRespondedSummary,
    ]
  );

  return { fetchEmails, loadMore, fetchCategoryEmails, refreshInPlace };
}

/**
 * Fix #2062: When the server confirms a category is empty (returned 0 emails) but the cached
 * summary still shows count > 0, immediately set the summary count to 0 so buildDisplayCategories
 * filters out the empty category without waiting for the background summary refresh. Closes the
 * timing window where the accordion would briefly show badge 0 but stay visible.
 *
 * Uses clearCategorySummaryCount (explicit set-to-zero) rather than subtracting the cached count,
 * so a concurrent optimistic update on the same category cannot push the count negative.
 */
function clearStaleEmptyCategorySummary(
  catKey: string,
  staleSummaryItem: CategorySummaryItem | undefined,
  dispatch: AppDispatch
): void {
  if (staleSummaryItem && staleSummaryItem.count > 0) {
    dispatch(clearCategorySummaryCount({ categoryKey: catKey }));
  }
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
  loadingCategoryNamesRef,
  categorySummaryRef,
}: {
  cachedEmails: Email[];
  catKey: string;
  categoryName: string;
  mode: InboxMode;
  dispatch: AppDispatch;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  fetchSessionRef: React.MutableRefObject<number>;
  /** Ref to current loading category keys — used to skip background fetch when one is already in-flight. Fix #1665. */
  loadingCategoryNamesRef: React.MutableRefObject<string[]>;
  /** Ref to the latest categorySummary — used to resolve the spinner for genuinely empty categories. Fix #1689. */
  categorySummaryRef: React.MutableRefObject<CategorySummaryItem[] | null>;
}): void {
  dispatch(updateCategoryEmails({ categoryKey: catKey, emails: cachedEmails }));
  if (cachedEmails.length > 0) {
    dispatch(markCategoryLoaded(catKey));
  } else {
    // Fix #1689: Cache is empty. Check if the summary also confirms 0 emails.
    // If summary agrees, the category is genuinely empty — mark loaded so the UI
    // shows the empty state instead of an infinite spinner.
    // If summary shows > 0, this is a stale-summary vs empty-cache race — fall
    // through to the background refresh which will reconcile the two.
    const summaryItem = categorySummaryRef.current?.find(
      item => getCategoryKey(item.id, item.name) === catKey
    );
    // Fix: distinguish "summary not yet loaded" (undefined) from "summary confirms 0 emails".
    // summaryItem?.count ?? 0 incorrectly treats undefined-summary as confirmed-0, causing
    // markCategoryLoaded to fire before the summary has been fetched. Only mark loaded when
    // the summaryItem is present AND its count is 0.
    if (summaryItem !== undefined && summaryItem !== null && (summaryItem.count ?? 0) === 0) {
      dispatch(markCategoryLoaded(catKey));
      devLog('[Accordion] Cached category is empty and summary confirms 0 — marking loaded:', categoryName, '(key:', catKey, ')');
      return; // no need for background refresh
    }
    // summaryItem undefined (not yet loaded) or count > 0 — fall through to background refresh
  }

  // Guard: skip background refresh if a fetch is already in-flight for this category
  // (e.g. refreshInPlace is fetching the same category concurrently). Fix #1665.
  if (loadingCategoryNamesRef.current.includes(catKey)) {
    devLog('[Accordion] Skipping background refresh for category (already in-flight):', categoryName, '(key:', catKey, ')');
    return;
  }

  const sessionId = fetchSessionRef.current;
  const params = buildCategoryParams(catKey);
  axios
    .get(`${API_URL}/emails/inbox?${params.toString()}`)
    .then(response => {
      if (fetchSessionRef.current !== sessionId) {
        dispatch(markCategoryLoadFailed(catKey)); // allows Effect 2 to schedule a retry
        return;
      }
      const freshEmails: Email[] = response.data.emails;
      dispatch(updateCategoryEmails({ categoryKey: catKey, emails: freshEmails }));
      setCachedCategoryEmails(mode, catKey, freshEmails);
      if (freshEmails.length === 0) {
        const staleSummaryItem = categorySummaryRef.current?.find(
          item => getCategoryKey(item.id, item.name) === catKey
        );
        clearStaleEmptyCategorySummary(catKey, staleSummaryItem, dispatch);
        devLog('[Accordion] Background refresh returned 0 emails — marking loaded (summary corrected by background refresh):', categoryName, '(key:', catKey, ')');
      }
      // Fix #1769: always mark loaded when the background refresh completes, regardless of
      // whether the summary agrees. If the summary is stale (shows count > 0 but API returned 0),
      // the background summary refresh will correct the count. Previously dispatching
      // markCategoryLoadFailed left isLoaded=false, causing an infinite spinner.
      dispatch(markCategoryLoaded(catKey));
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
  /** Ref to the latest categorySummary from Redux — used to guard stale-UUID cache busts. */
  categorySummaryRef: React.MutableRefObject<CategorySummaryItem[] | null>;
}

/** Handles a failed category fetch: applies backoff state and schedules a retry timer. */
function handleCategoryFetchError(
  args: CategoryFetchArgs,
  catKey: string,
  error: unknown,
  sessionId: number
) {
  const { categoryName, categoryId, mode, dispatch, buildCategoryParams, loadedCategoryNamesRef, loadingCategoryNamesRef, fetchSessionRef, categoryBackoff, pendingRetryTimersRef, categorySummaryRef } = args;

  // AbortError is an expected, non-actionable signal (e.g. component unmounted or fetch cancelled).
  // Skip backoff/retry logic and swallow silently — logging it as an error would be misleading.
  if (error instanceof DOMException && error.name === ABORT_ERROR_NAME) {
    dispatch(markCategoryLoadFailed(catKey));
    return;
  }
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

  const is429 = axios.isAxiosError(error) && error.response?.status === HTTP_TOO_MANY_REQUESTS;
  const delayMs = Math.max(0, backoffState.nextAllowedAt - Date.now());
  console.warn(
    `[Accordion] Category load failed (${is429 ? '429' : 'error'}), retry ${backoffState.retryCount}/${MAX_CATEGORY_FETCH_RETRIES} in ${Math.round(delayMs / MS_PER_SECOND)}s:`,
    categoryName
  );
  dispatch(markCategoryLoadFailed(catKey));

  const retryTimer = setTimeout(() => {
    pendingRetryTimersRef.current.delete(retryTimer);
    fetchCategoryEmailsImpl({
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
      categorySummaryRef,
    }).catch(err => console.error('[limbo-recovery] Backoff retry failed:', err));
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

// eslint-disable-next-line max-statements -- pre-existing: complex async function with many conditional branches
async function fetchCategoryEmailsImpl(args: CategoryFetchArgs) {
const { categoryName, categoryId, mode, dispatch, buildCategoryParams, fetchSessionRef, categoryBackoff, loadingCategoryNamesRef, categorySummaryRef } = args;
  // Compute the stable key: UUID when available, name as fallback
  const catKey = getCategoryKey(categoryId, categoryName);

  // Early-exit: already loaded/loading, wrong mode, or in backoff/circuit-open state.
  if (shouldSkipCategoryFetch(args, catKey)) {
    return;
  }

  // Stale-while-revalidate for categories: show cached emails instantly, refresh in background.
  // Fix #1769: enforce the same TTL as the summary cache so category entries older than
  // INBOX_CACHE_TTL_MS are treated as a cache miss and re-fetched with a loading indicator.
  const cachedEmails = getCachedCategoryEmails(mode, catKey, INBOX_CACHE_TTL_MS);
  if (cachedEmails !== null) {
serveCategoryFromCacheAndRefresh({ cachedEmails, catKey, categoryName, mode, dispatch, buildCategoryParams, fetchSessionRef, loadingCategoryNamesRef, categorySummaryRef });
    return;
  }

  const sessionId = fetchSessionRef.current;
  categoryBackoff.markInFlight(catKey);
  dispatch(markCategoryLoading(catKey));
  devLog('[Accordion] Fetching category:', categoryName, '(key:', catKey, ')');

  try {
    const params = buildCategoryParams(catKey);
    const response = await axios.get(`${API_URL}/emails/inbox?${params.toString()}`);
    // Emails now include category_id (UUID) from the server, so groupEmailsByCategory
    // keys by UUID directly. No normalization needed.
    const emails: Email[] = response.data.emails;

    if (fetchSessionRef.current !== sessionId) {
      devLog('[Accordion] Stale fetch discarded for category:', categoryName, '(session changed)');
      return;
    }

    // Look up the cached summary entry once for both stale-UUID detection (Fix #1114) and
    // empty-category clearing (Fix #2062). The id-OR-name predicate also catches stale-UUID
    // entries where the summary still has the old id but the name matches.
    const summaryItem = emails.length === 0
      ? categorySummaryRef.current?.find(
          item => item.id === categoryId || item.name === categoryName
        )
      : undefined;

    // Fix #1114 — stale UUID self-healing:
    // Only bust the cache when the category summary said count > 0 but the fetch returned 0,
    // which suggests a stale UUID (category re-created server-side after a schema change).
    // Skip the bust for legitimately empty categories (summary count === 0) to avoid
    // unnecessary cache invalidation on every expand of an empty category.
    if (emails.length === 0 && categoryId) {
      const summaryCount = summaryItem?.count ?? 0;
      if (summaryCount > 0) {
        console.warn(
          '[Accordion] Category returned 0 emails but summary says',
          summaryCount,
          '— possible stale UUID, busting summary cache for mode:',
          mode,
          '| category:',
          categoryName,
          '(key:',
          catKey,
          ')'
        );
        // Clear the summary cache so the next inbox load re-fetches fresh UUIDs.
        // The category cache entry will be naturally evicted (we just wrote [] below).
        clearCacheForMode(mode);
      } else {
        devLog(
          '[Accordion] Category returned 0 emails and summary also shows 0 — skipping cache bust for mode:',
          mode,
          '| category:',
          categoryName,
          '(key:',
          catKey,
          ')'
        );
      }
    }

    categoryBackoff.onSuccess(catKey);
    dispatch(updateCategoryEmails({ categoryKey: catKey, emails }));
    setCachedCategoryEmails(mode, catKey, emails);

    if (emails.length === 0) {
      clearStaleEmptyCategorySummary(catKey, summaryItem, dispatch);
    }

    // Fix #1769: Always mark loaded after a successful API call, regardless of what the
    // summary says. When the API returns 0 emails but the summary shows > 0, the summary
    // is stale — the background summary refresh will correct the count. Trusting the API
    // result here stops the infinite spinner that previously occurred when markCategoryLoadFailed
    // left isLoaded=false while the stale summary prevented the fast-path from firing.
    dispatch(markCategoryLoaded(catKey));
    if (emails.length > 0) {
      devLog('[Accordion] Loaded category:', categoryName, '(key:', catKey, ')', emails.length, 'emails');
    } else {
      devLog('[Accordion] Category returned 0 emails — marking loaded (summary will be corrected by background refresh):', categoryName, '(key:', catKey, ')');
    }
  } catch (error: unknown) {
    handleCategoryFetchError(args, catKey, error, sessionId);
  } finally {
    categoryBackoff.clearInFlight(catKey);
  }
}

/** Extracted: refresh inbox in-place without clearing state. */
async function refreshInPlaceImpl({
  mode,
  dispatch,
  filters,
  buildSummaryParams,
  buildCategoryParams,
  buildAutoRespondedParams,
  buildAutoRespondedSummary,
  loadedCategoryNamesRef,
  activeFilters,
  signal,
}: {
  mode: InboxMode;
  dispatch: AppDispatch;
  filters?: InboxFilter;
  buildSummaryParams: () => URLSearchParams;
  buildCategoryParams: (categoryKey: string) => URLSearchParams;
  buildAutoRespondedParams: () => URLSearchParams;
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>;
  loadedCategoryNamesRef: React.MutableRefObject<string[]>;
  /** Fix #1571 Bug 1: filters used to scope the cache write-back to the filter hash. */
  activeFilters?: { minPriority?: number | null; maxPriority?: number | null };
  signal?: AbortSignal;
}) {
  if (mode === MODE_AUTORESPONDED) {
    try {
      await fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary, signal);
    } catch (err) {
      console.warn('[refreshInPlace] Autoresponded refresh failed:', err);
    }
    return;
  }

  // Fix #1571 Bug 1: compute filter hash once for all cache write-backs in this refresh.
  const hash = activeFilters ? filterHash(activeFilters) : undefined;

  try {
    const summaryParams = buildSummaryParams();
    const summaryResponse = await axios.get(`${API_URL}/emails/inbox-summary?${summaryParams.toString()}`, { signal });
    const freshCategories = summaryResponse.data.categories;
    dispatch(setCategorySummary(freshCategories));
    dispatch(setSummaryLoading(false));
    dispatch(setTotalCount(summaryResponse.data.total));
    setCachedSummary(mode, freshCategories, hash);
  } catch (err) {
    console.warn('[refreshInPlace] Summary fetch failed:', err);
    return;
  }

  // loadedCategoryNamesRef now stores category keys (UUIDs or names).
  // buildCategoryParams handles both: UUID keys → categoryIds=, name keys → categories=
  const loadedCategoryKeys = [...loadedCategoryNamesRef.current];
  const categoryResults = await Promise.all(
    loadedCategoryKeys.map(async categoryKey => {
      try {
        const catParams = buildCategoryParams(categoryKey);
        const catResponse = await axios.get(`${API_URL}/emails/inbox?${catParams.toString()}`, { signal });
        // Emails now include category_id (UUID) from the server; no normalization needed.
        const emails: Email[] = (catResponse.data as { emails: Email[] }).emails;
        // Write category emails without a filter hash so fetchCategoryEmailsImpl (which reads
        // without a hash) can serve them. Summary uses the hash to scope to the active filter;
        // category keys are already per-category so a separate hash scope isn't needed here.
        setCachedCategoryEmails(mode, categoryKey, emails);
        return { categoryKey, emails };
      } catch (err) {
        console.warn(`[refreshInPlace] Failed to refresh category key "${categoryKey}":`, err);
        return null;
      }
    })
  );

  // Dispatch all updateCategoryEmails actions in a single batch → collapses N re-renders into 1.
  // Without this, each async-resolved dispatch fires its own render cycle (React 18 auto-batching
  // only covers synchronous dispatches, not resolved Promises).
  const validResults = categoryResults.filter(
    (result): result is { categoryKey: string; emails: Email[] } => result !== null
  );
  devLog('[refreshInPlace] batching', validResults.length, 'updateCategoryEmails dispatches');
  unstable_batchedUpdates(() => {
    validResults.forEach(({ categoryKey, emails }) => {
      dispatch(updateCategoryEmails({ categoryKey, emails }));
    });
  });
}

export function appendFilterParams(params: URLSearchParams, filters: InboxFilter | undefined): void {
  if (!filters) {
    return;
  }
  if (filters.categories?.length) {
    // Only send categoryIds= (UUID). Categories without a UUID are a server-side data bug.
    params.append(PARAM_CATEGORY_IDS, filters.categories.join(','));
  }
  if (filters.minPriority !== null && filters.minPriority !== undefined) {
    params.append('minPriority', filters.minPriority.toString());
  }
  if (filters.maxPriority !== null && filters.maxPriority !== undefined) {
    params.append('maxPriority', filters.maxPriority.toString());
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
 * Always uses `categoryIds=` (UUID). A missing UUID is a server-side data bug.
 */
function buildCategoryParamsImpl(
  mode: InboxMode,
  filters: InboxFilter | undefined,
  categoryKey: string
): URLSearchParams {
  const params = new URLSearchParams();
  params.append('mode', mode);
  params.append(PARAM_CATEGORY_IDS, categoryKey);
  params.append('limit', INBOX_FETCH_LIMIT.toString());
  params.append('offset', '0');
  if (filters) {
    if (filters.accountIds?.length) {
      params.append('accounts', filters.accountIds.join(','));
    }
    if (filters.minPriority !== null && filters.minPriority !== undefined) {
      params.append('minPriority', filters.minPriority.toString());
    }
    if (filters.maxPriority !== null && filters.maxPriority !== undefined) {
      params.append('maxPriority', filters.maxPriority.toString());
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
  hash,
}: {
  cachedSummary: CategorySummaryItem[];
  mode: InboxMode;
  dispatch: AppDispatch;
  buildSummaryParams: () => URLSearchParams;
  /** Fix #1571 Bug 1: filter hash to scope the write-back to the same key. */
  hash?: string;
}): void {
  dispatch(setFetchError(null));
  dispatch(clearCategoryState());
  dispatch(setSummaryLoading(true));
  dispatch(setEmails([]));
  dispatch(setCurrentOffset(0));
  dispatch(setHasMore(false));
  dispatch(setTotalCount(cachedSummary.reduce((sum, cat) => sum + cat.count, 0)));
  dispatch(setCategorySummary(cachedSummary));
  dispatch(setSummaryLoading(false));
  dispatch(setLoading(false));
  dispatch(setDecrypting(false));
  dispatch(setLastFetchedAt(Date.now()));
  fetchInboxSummary(dispatch, buildSummaryParams)
    .then(freshSummary => {
      if (freshSummary) {
        setCachedSummary(mode, freshSummary, hash);
      }
    })
    .catch(err => console.warn('[fetchEmails] Background refresh failed:', err));
}

/** Reset inbox state before a full (non-cache) fetch. */
function dispatchFetchStart(dispatch: AppDispatch) {
  dispatch(setDecrypting(true));
  dispatch(setFetchError(null));
  dispatch(clearCategoryState());
  dispatch(setSummaryLoading(true));
  dispatch(setEmails([]));
  dispatch(setCurrentOffset(0));
  dispatch(setHasMore(false));
  dispatch(setTotalCount(0));
}

async function fetchEmailsImpl({
  mode,
  dispatch,
  filters,
  buildSummaryParams,
  buildAutoRespondedParams,
  buildAutoRespondedSummary,
  activeFilters,
  signal,
}: {
  mode: InboxMode;
  dispatch: AppDispatch;
  filters?: InboxFilter;
  buildSummaryParams: () => URLSearchParams;
  buildAutoRespondedParams: () => URLSearchParams;
  buildAutoRespondedSummary: (emails: Email[]) => Array<{ id: null; name: string; count: number }>;
  /** Fix #1571 Bug 1: filters used to compute the cache key hash. */
  activeFilters?: { minPriority?: number | null; maxPriority?: number | null };
  signal?: AbortSignal;
}) {
  // Stale-while-revalidate: if we have cached summary data AND it is within the
  // TTL window, serve it immediately (no spinner) then refresh in the background.
  // Fix #1114: enforce INBOX_CACHE_TTL_MS so stale UUIDs do not persist past 60 s
  // and trigger the backend silent-skip bug.
  // Fix #1571 Bug 1: scope cache key to the active filter hash so stale-while-revalidate
  // never serves data from a different filter configuration.
  const hash = activeFilters ? filterHash(activeFilters) : undefined;
  const cachedSummary = mode !== MODE_AUTORESPONDED ? getCachedSummary(mode, INBOX_CACHE_TTL_MS, hash) : null;
  const hasCachedData = cachedSummary !== null && cachedSummary.length > 0;

  if (hasCachedData) {
    serveSummaryFromCacheAndRefresh({ cachedSummary, mode, dispatch, buildSummaryParams, hash });
    return;
  }

  // No cache — full fetch with loading indicator
  dispatchFetchStart(dispatch);
  try {
    if (mode === MODE_AUTORESPONDED) {
      await fetchAutoRespondedEmails(dispatch, buildAutoRespondedParams, buildAutoRespondedSummary, signal);
    } else if (mode === MODE_SCHEDULED) {
      // Scheduled emails are managed by ScheduledEmailsManager, not the inbox email slice.
      // Nothing to fetch here; clear loading state so the panel renders immediately.
      dispatch(setDecrypting(false));
      dispatch(setLoading(false));
      dispatch(setLoadingModeSwitch(false));
      return;
    } else {
      const freshSummary = await fetchInboxSummary(dispatch, buildSummaryParams, signal);
      if (freshSummary) {
        setCachedSummary(mode, freshSummary, hash);
      }
    }
    dispatch(setDecrypting(false));
    dispatch(setFetchError(null));
    dispatch(setLastFetchedAt(Date.now()));
  } catch (error: unknown) {
    dispatch(setDecrypting(false));
    dispatch(setSummaryLoading(false));
    handleFetchError(dispatch, error);
  } finally {
    dispatch(setLoading(false));
    dispatch(setRefreshing(false));
    dispatch(setLoadingModeSwitch(false));
  }
}

function handleFetchError(dispatch: AppDispatch, error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === ERROR_CODE_ERR_NETWORK || error.message?.includes(ERROR_NETWORK)) {
      dispatch(setFetchError('Unable to connect to the server. Please check if the server is running.'));
    } else if (error.response?.status === HTTP_UNAUTHORIZED) {
      const msg = (error.response?.data as { message?: string } | undefined)?.message ?? '';
      dispatch(
        setFetchError(
          msg.includes(ERROR_GMAIL_REQUIRED) || msg.includes(ERROR_GMAIL)
            ? 'GMAIL_REQUIRED'
            : 'Please log in again to view emails.'
        )
      );
    } else {
      dispatch(setFetchError(getAxiosErrorMessage(error, 'Failed to load emails. Please try again.')));
    }
  } else if (error instanceof Error && error.message.includes(ERROR_NETWORK)) {
    dispatch(setFetchError('Unable to connect to the server. Please check if the server is running.'));
  } else {
    dispatch(setFetchError('Failed to load emails. Please try again.'));
  }
}
