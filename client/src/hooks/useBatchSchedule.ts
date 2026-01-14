import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

const BATCH_STATUS_CACHE_KEY = 'batchStatusCache';
const BATCH_STATUS_CACHE_TTL = 30000; // 30 seconds
const LAST_URGENT_CHECK_KEY = 'lastUrgentCheckTime';

interface CacheEntry {
  nextDelivery: string | null;
  timestamp: number;
}

interface UseBatchScheduleReturn {
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  fetchBatchStatus: () => Promise<void>;
  updateLastUrgentCheck: () => void;
}

export function useBatchSchedule(): UseBatchScheduleReturn {
  const [nextDelivery, setNextDelivery] = useState<Date | null>(null);
  const [lastUrgentCheck, setLastUrgentCheck] = useState<Date | null>(null);

  // Load lastUrgentCheck from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LAST_URGENT_CHECK_KEY);
    if (stored) {
      setLastUrgentCheck(new Date(stored));
    }
  }, []);

  const fetchBatchStatus = useCallback(async () => {
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
    } catch (e) {
      // Ignore cache errors
    }

    try {
      const response = await axios.get(`${API_URL}/emails/batch-status`);
      const nextDeliveryDate = response.data.nextDelivery ? new Date(response.data.nextDelivery) : null;
      setNextDelivery(nextDeliveryDate);

      // Cache the result
      const cacheEntry: CacheEntry = {
        nextDelivery: response.data.nextDelivery,
        timestamp: Date.now(),
      };
      localStorage.setItem(BATCH_STATUS_CACHE_KEY, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('Error fetching batch status:', error);
    }
  }, []);

  const updateLastUrgentCheck = useCallback(() => {
    const now = new Date();
    setLastUrgentCheck(now);
    localStorage.setItem(LAST_URGENT_CHECK_KEY, now.toISOString());
  }, []);

  return {
    nextDelivery,
    lastUrgentCheck,
    fetchBatchStatus,
    updateLastUrgentCheck,
  };
}
