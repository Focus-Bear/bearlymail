import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { MS_PER_MINUTE } from 'constants/numbers';

const BATCH_STATUS_CACHE_KEY = 'batchStatusCache';
const BATCH_STATUS_CACHE_TTL = 30000; // 30 seconds
const LAST_URGENT_CHECK_KEY = 'lastUrgentCheckTime';
const URGENT_CHECK_INTERVAL_MS = 5 * MS_PER_MINUTE;

interface CacheEntry {
  nextDelivery: string | null;
  timestamp: number;
}

interface UrgentCheckResult {
  hasUrgent: boolean;
  count: number;
  emails: Array<{ subject: string; from: string; priorityScore: number }>;
}

interface UseBatchScheduleReturn {
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  fetchBatchStatus: (signal?: AbortSignal) => Promise<void>;
  updateLastUrgentCheck: () => void;
  checkForUrgentEmails: () => Promise<UrgentCheckResult>;
}

export function useBatchSchedule(): UseBatchScheduleReturn {
  const [nextDelivery, setNextDelivery] = useState<Date | null>(null);
  const [lastUrgentCheck, setLastUrgentCheck] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedupes concurrent batch-status fetches. The localStorage cache below is
  // only written AFTER the response resolves, so callers that race on initial
  // load (init effect + mode/priority-filter re-fetch) would each miss the cache
  // and fire their own request. Sharing the in-flight promise collapses them
  // into a single network call.
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Load lastUrgentCheck from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LAST_URGENT_CHECK_KEY);
    if (stored) {
      setLastUrgentCheck(new Date(stored));
    }
  }, []);

  const updateLastUrgentCheck = useCallback(() => {
    const now = new Date();
    setLastUrgentCheck(now);
    localStorage.setItem(LAST_URGENT_CHECK_KEY, now.toISOString());
  }, []);

  const checkForUrgentEmails = useCallback(async (): Promise<UrgentCheckResult> => {
    try {
      const response = await axios.post(`${API_URL}/emails/check-urgent`);
      updateLastUrgentCheck();
      return {
        hasUrgent: response.data.hasUrgent || false,
        count: response.data.count || 0,
        emails: response.data.emails || [],
      };
    } catch (error) {
      console.error('Error checking for urgent emails:', error);
      // Still update the timestamp even on error - we attempted a check
      updateLastUrgentCheck();
      return { hasUrgent: false, count: 0, emails: [] };
    }
  }, [updateLastUrgentCheck]);

  // Set up periodic urgent email check every 5 minutes
  useEffect(() => {
    // Check immediately on mount
    checkForUrgentEmails();

    // Then set up interval
    intervalRef.current = setInterval(() => {
      checkForUrgentEmails();
    }, URGENT_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForUrgentEmails]);

  const fetchBatchStatus = useCallback(async (signal?: AbortSignal) => {
    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(BATCH_STATUS_CACHE_KEY);
      if (cached) {
        const cacheEntry: CacheEntry = JSON.parse(cached);
        const age = Date.now() - cacheEntry.timestamp;
        if (age < BATCH_STATUS_CACHE_TTL) {
          // Use cached value
          setNextDelivery(cacheEntry.nextDelivery ? new Date(cacheEntry.nextDelivery) : null);
          return;
        }
      }
    } catch (err) {
      // Ignore cache errors
    }

    // A request is already in flight for this window — reuse it instead of
    // firing a duplicate network call.
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const request = (async () => {
      try {
        const response = await axios.get(`${API_URL}/emails/batch-status`, { signal });
        const nextDeliveryDate = response.data.nextDelivery ? new Date(response.data.nextDelivery) : null;
        setNextDelivery(nextDeliveryDate);

        // Cache the result
        const cacheEntry: CacheEntry = {
          nextDelivery: response.data.nextDelivery,
          timestamp: Date.now(),
        };
        localStorage.setItem(BATCH_STATUS_CACHE_KEY, JSON.stringify(cacheEntry));
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }
        console.error('Error fetching batch status:', error);
      }
    })();

    inFlightRef.current = request;
    try {
      await request;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  return {
    nextDelivery,
    lastUrgentCheck,
    fetchBatchStatus,
    updateLastUrgentCheck,
    checkForUrgentEmails,
  };
}
