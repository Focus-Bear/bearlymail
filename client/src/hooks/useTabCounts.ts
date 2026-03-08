import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

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
  fetchTabCounts: (force?: boolean) => Promise<void>;
  updateTabCountsOptimistically: (changes: TabCountChanges) => void;
}

const TAB_COUNTS_CACHE_KEY = 'tabCountsCacheV2'; // Changed key to invalidate old cache
const TAB_COUNTS_CACHE_TTL = 30000; // 30 seconds

interface CacheEntry {
  counts: TabCounts;
  timestamp: number;
}

export function useTabCounts(): UseTabCountsReturn {
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTabCounts = useCallback(async (force = false) => {
    // Check localStorage cache first (unless force refresh is requested)
    if (!force) {
      try {
        const cached = localStorage.getItem(TAB_COUNTS_CACHE_KEY);
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
      const response = await axios.get(`${API_URL}/emails/tab-counts`);
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
      localStorage.setItem(TAB_COUNTS_CACHE_KEY, JSON.stringify(cacheEntry));
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
      try {
        const cached = localStorage.getItem(TAB_COUNTS_CACHE_KEY);
        if (cached) {
          const existingEntry: CacheEntry = JSON.parse(cached);
          localStorage.setItem(
            TAB_COUNTS_CACHE_KEY,
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

  // Fetch on mount
  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  return {
    tabCounts,
    loading,
    fetchTabCounts,
    updateTabCountsOptimistically,
  };
}
