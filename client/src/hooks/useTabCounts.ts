import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { InboxFilter } from 'hooks/useInboxFilters';

const ABORT_ERROR_NAME = 'AbortError';

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

interface TabCountChanges {
  triage?: number;
  action?: number;
  followUp?: number;
}

interface UseTabCountsReturn {
  tabCounts: TabCounts | null;
  loading: boolean;
  fetchTabCounts: (force?: boolean, filters?: Partial<InboxFilter> | null, signal?: AbortSignal, silent?: boolean) => Promise<void>;
  updateTabCountsOptimistically: (changes: TabCountChanges) => void;
}

const TAB_COUNTS_CACHE_KEY = 'tabCountsCacheV3'; // Bumped to invalidate old cache shape
const TAB_COUNTS_CACHE_TTL = 30000; // 30 seconds
// Background poll interval — short enough to catch batch deliveries and background syncs
// promptly while the user stays on one tab, but not so short that it hammers the server.
const TAB_COUNTS_POLL_INTERVAL_MS = 30_000; // 30 seconds

interface CacheEntry {
  counts: TabCounts;
  timestamp: number;
}

/**
 * Tab-count badges reflect ALL work in each mode, independent of the Triage guided
 * priority default. That default (High-and-above) is a Triage *list* filter and must
 * NOT leak into how Action/Follow-Up work is counted — otherwise the distraction-tax
 * "existing work" snapshot under-counts Medium/Low threads and the inbox wrongly reads
 * as "all cleared" while lower-priority Action/Follow-Up work still remains. Strip the
 * priority dimension before building any tab-counts request; category/account filters
 * (which are legitimate cross-mode narrowings) still apply.
 */
function stripPriorityFilter(
  filters?: Partial<InboxFilter> | null
): Partial<InboxFilter> | null | undefined {
  if (!filters) {
    return filters;
  }
  const { minPriority: _minPriority, maxPriority: _maxPriority, ...rest } = filters;
  return rest;
}

/**
 * Build a stable cache key from the (priority-stripped) filter object.
 * The remaining dimensions (categories, accountIds) contribute so that different
 * filter combinations are cached independently.
 */
function buildCacheKey(filters?: Partial<InboxFilter> | null): string {
  const parts: string[] = [TAB_COUNTS_CACHE_KEY];
  if (filters?.categories && filters.categories.length > 0) {
    parts.push(`c${[...filters.categories].sort().join('-')}`);
  }
  if (filters?.accountIds && filters.accountIds.length > 0) {
    parts.push(`a${[...filters.accountIds].sort().join('-')}`);
  }
  return parts.join('_');
}

/**
 * Build the query-string portion of the tab-counts URL from the (priority-stripped)
 * filter object. Priority is intentionally never sent — see stripPriorityFilter.
 */
function buildQueryParams(filters?: Partial<InboxFilter> | null): string {
  const params = new URLSearchParams();
  if (filters?.categories && filters.categories.length > 0) {
    params.set('categories', filters.categories.join(','));
  }
  if (filters?.accountIds && filters.accountIds.length > 0) {
    params.set('accountIds', filters.accountIds.join(','));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTabCounts(): UseTabCountsReturn {
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const [loading, setLoading] = useState(false);
  // Tracks the cache key for the most recently loaded tab counts so that
  // updateTabCountsOptimistically writes to the correct filtered entry instead
  // of always falling back to the base key.
  const currentCacheKeyRef = useRef<string>(TAB_COUNTS_CACHE_KEY);
  // Track filters used in the most recent fetch so background polling re-uses them.
  const lastFiltersRef = useRef<Partial<InboxFilter> | null | undefined>(undefined);
  // Only start background polling after the first successful fetch to avoid
  // spurious requests on mount before useInboxInitialization has run.
  const hasEverFetchedRef = useRef(false);

  const fetchTabCounts = useCallback(
// eslint-disable-next-line max-statements -- pre-existing: complex async function with many conditional branches
    async (force = false, filters?: Partial<InboxFilter> | null, signal?: AbortSignal, silent = false) => {
      // Never let the Triage guided priority default filter the tab counts.
      const countFilters = stripPriorityFilter(filters);
      lastFiltersRef.current = countFilters;
      const cacheKey = buildCacheKey(countFilters);
      currentCacheKeyRef.current = cacheKey;

      if (!force) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const cacheEntry: CacheEntry = JSON.parse(cached);
            const age = Date.now() - cacheEntry.timestamp;
            if (age < TAB_COUNTS_CACHE_TTL) {
              setTabCounts(cacheEntry.counts);
              hasEverFetchedRef.current = true;
              return;
            }
          }
        } catch (err) {
          // Ignore cache errors
        }
      }

      if (!silent) {
        setLoading(true);
      }
      try {
        const qs = buildQueryParams(countFilters);
        const response = await axios.get(`${API_URL}/emails/tab-counts${qs}`, { signal });
        const counts: TabCounts = {
          triage: response.data.triage || 0,
          action: response.data.action || 0,
          followUp: response.data.followUp || 0,
        };
        // Only update state if this fetch is still for the current filters.
        // A background poll for a previous filter set may complete after the user
        // has switched filters; discarding stale results prevents incorrect counts.
        if (currentCacheKeyRef.current === cacheKey) {
          setTabCounts(counts);
        }
        hasEverFetchedRef.current = true;

// Cache the result
      const cacheEntry: CacheEntry = {
        counts,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      // Fix #1689: Handle AbortError silently — the request was cancelled due to
      // navigation or React StrictMode double-mount. Restore stale cached counts
      // (if available) so badges don't go blank.
      if (
        (error instanceof Error && error.name === ABORT_ERROR_NAME) ||
        axios.isCancel(error)
      ) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const cacheEntry: CacheEntry = JSON.parse(cached);
            setTabCounts(cacheEntry.counts);
          }
        } catch {
          // ignore cache read errors
        }
        return;
      }
      console.error('Error fetching tab counts:', error);
      // Fallback: restore last-known value from cache so badges don't go blank.
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheEntry: CacheEntry = JSON.parse(cached);
          setTabCounts(cacheEntry.counts);
        }
      } catch {
        // ignore cache read errors
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Optimistically update tab counts without fetching from server
  // This is used after actions like archive/star/snooze where the server
  // processes the action asynchronously (via job queue) and the counts
  // would be stale if fetched immediately
  const updateTabCountsOptimistically = useCallback((changes: TabCountChanges) => {
    setTabCounts(prev => {
      if (!prev) {
        return prev;
      }
      const newCounts = {
        triage: Math.max(0, prev.triage + (changes.triage || 0)),
        action: Math.max(0, prev.action + (changes.action || 0)),
        followUp: Math.max(0, prev.followUp + (changes.followUp || 0)),
      };
      // Update cache counts but PRESERVE the original timestamp from the last server fetch.
      // This prevents optimistic updates from extending the cache TTL, which could hide
      // server-side changes (e.g. background sync) for longer than the intended TTL.
      // Use the current filter's cache key so filtered views stay consistent.
      try {
        const activeCacheKey = currentCacheKeyRef.current;
        const cached = localStorage.getItem(activeCacheKey);
        if (cached) {
          const existingEntry: CacheEntry = JSON.parse(cached);
          localStorage.setItem(
            activeCacheKey,
            JSON.stringify({
              counts: newCounts,
              timestamp: existingEntry.timestamp,
            })
          );
        }
      } catch (err) {
        // Ignore cache errors
      }
      return newCounts;
    });
  }, []);

  // NOTE: The mount-time self-fetch was removed to prevent duplicate requests during
  // inbox load. Tab counts are fetched by useInboxInitialization (and useInboxModeChanges
  // on mode switches) with the correct active filters. A standalone unfiltered mount fetch
  // here produced a stale/wrong count when filters were active, and doubled the
  // tab-counts request on every inbox open. See #1665.

  // Stable ref for background poll callback — always captures fresh hasEverFetchedRef /
  // lastFiltersRef values without making them reactive deps of the interval effect.
  // (useEffectEvent does not exist in React 19.2 stable; this is the stable equivalent.)
  const backgroundPollRef = useRef<() => void>(() => {});
  backgroundPollRef.current = () => {
    // Don't poll until the first explicit fetch has completed — avoids duplicate
    // requests on mount before useInboxInitialization has run.
    if (!hasEverFetchedRef.current) {
      return;
    }
    fetchTabCounts(true, lastFiltersRef.current, undefined, true).catch(err => {
      if (!(err instanceof Error && err.name === ABORT_ERROR_NAME) && !axios.isCancel(err)) {
        console.error('Background tab count refresh failed:', err);
      }
    });
  };

  // Background polling: refresh tab counts on a fixed interval so counts stay
  // accurate while the user remains on one tab (e.g. a batch delivery updating
  // the triage count while the user is in the action tab).
  useEffect(() => {
    const interval = setInterval(() => {
      backgroundPollRef.current();
    }, TAB_COUNTS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []); // empty — backgroundPollRef is always current

  return {
    tabCounts,
    loading,
    fetchTabCounts,
    updateTabCountsOptimistically,
  };
}
