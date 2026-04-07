import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { InboxFilter } from 'hooks/useInboxFilters';

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
  fetchTabCounts: (force?: boolean, filters?: Partial<InboxFilter> | null, signal?: AbortSignal) => Promise<void>;
  updateTabCountsOptimistically: (changes: TabCountChanges) => void;
}

const TAB_COUNTS_CACHE_KEY = 'tabCountsCacheV3'; // Bumped to invalidate old cache shape
const TAB_COUNTS_CACHE_TTL = 30000; // 30 seconds

interface CacheEntry {
  counts: TabCounts;
  timestamp: number;
}

/**
 * Build a stable cache key from the full filter object.
 * All three dimensions (minPriority, categories, accountIds) contribute so that
 * different filter combinations are cached independently.
 */
function buildCacheKey(filters?: Partial<InboxFilter> | null): string {
  const parts: string[] = [TAB_COUNTS_CACHE_KEY];
  if (filters?.minPriority !== undefined && filters.minPriority !== null) {
    parts.push(`p${filters.minPriority}`);
  }
  if (filters?.categories && filters.categories.length > 0) {
    parts.push(`c${[...filters.categories].sort().join('-')}`);
  }
  if (filters?.accountIds && filters.accountIds.length > 0) {
    parts.push(`a${[...filters.accountIds].sort().join('-')}`);
  }
  return parts.join('_');
}

/**
 * Build the query-string portion of the tab-counts URL.
 */
function buildQueryParams(filters?: Partial<InboxFilter> | null): string {
  const params = new URLSearchParams();
  if (filters?.minPriority !== undefined && filters.minPriority !== null) {
    params.set('minPriority', String(filters.minPriority));
  }
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

  const fetchTabCounts = useCallback(async (force = false, filters?: Partial<InboxFilter> | null, signal?: AbortSignal) => {
    const cacheKey = buildCacheKey(filters);
    currentCacheKeyRef.current = cacheKey;

    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheEntry: CacheEntry = JSON.parse(cached);
          const age = Date.now() - cacheEntry.timestamp;
          if (age < TAB_COUNTS_CACHE_TTL) {
            setTabCounts(cacheEntry.counts);
            return;
          }
        }
      } catch (err) {
        // Ignore cache errors
      }
    }

    setLoading(true);
    try {
      const qs = buildQueryParams(filters);
      const response = await axios.get(`${API_URL}/emails/tab-counts${qs}`, { signal });
      const counts: TabCounts = {
        triage: response.data.triage || 0,
        action: response.data.action || 0,
        followUp: response.data.followUp || 0,
      };
      setTabCounts(counts);

      // Cache the result
      const cacheEntry: CacheEntry = {
        counts,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('Error fetching tab counts:', error);
    } finally {
      setLoading(false);
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

  return {
    tabCounts,
    loading,
    fetchTabCounts,
    updateTabCountsOptimistically,
  };
}
