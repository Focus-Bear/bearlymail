import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { POLLING_INTERVAL_MS, RECATEGORIZE_ZERO_TOTAL_MAX_POLLS } from 'constants/numbers';

const STORAGE_KEY = 'recategorize_progress';

interface StoredProgress {
  batchId: string;
  total: number;
  startedAt: string;
}

export interface RecategorizeProgressState {
  batchId: string | null;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  isComplete: boolean;
  isShowing: boolean;
}

const loadFromStorage = (): StoredProgress | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredProgress;
  } catch {
    return null;
  }
};

const saveToStorage = (progressData: StoredProgress) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
  } catch {
    // ignore
  }
};

const clearStorage = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const useRecategorizeProgress = () => {
  const [progress, setProgress] = useState<RecategorizeProgressState>({
    batchId: null,
    total: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    isComplete: false,
    isShowing: false,
  });

  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const isPollingRef = useRef(false);
  /** Backend may briefly report total=0; after several polls with no jobs, stop waiting (legacy mismatch). */
  const zeroTotalStreakRef = useRef(0);

  const stopPolling = useCallback(() => {
    cancelledRef.current = true;
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async (batchId: string, storedTotal: number) => {
    if (isPollingRef.current || cancelledRef.current) {
      return;
    }

    isPollingRef.current = true;
    try {
      const response = await axios.get(`${API_URL}/emails/recategorize-progress?batchId=${batchId}`);
      if (cancelledRef.current) {
        return;
      }

      const { total, completed, failed, pending } = response.data as {
        total: number;
        completed: number;
        failed: number;
        pending: number;
      };

      if (total > 0) {
        zeroTotalStreakRef.current = 0;
      } else if (storedTotal > 0) {
        zeroTotalStreakRef.current += 1;
      } else {
        zeroTotalStreakRef.current = 0;
      }

      // Use stored total if backend reports 0 (for display purposes only)
      const effectiveTotal = total > 0 ? total : storedTotal;
      // Complete when all known jobs finished, or when progress never appears for this batch
      // after several polls (avoids infinite spinner when PgBoss rows are filtered out).
      const isComplete =
        (total > 0 && pending === 0) ||
        (zeroTotalStreakRef.current >= RECATEGORIZE_ZERO_TOTAL_MAX_POLLS && storedTotal > 0);

      setProgress({
        batchId,
        total: effectiveTotal,
        completed,
        failed,
        pending,
        isComplete,
        isShowing: true,
      });

      if (!isComplete && !cancelledRef.current) {
        pollingTimeoutRef.current = setTimeout(() => {
          isPollingRef.current = false;
          pollProgress(batchId, storedTotal);
        }, POLLING_INTERVAL_MS);
      } else {
        isPollingRef.current = false;
      }
    } catch {
      isPollingRef.current = false;
      if (!cancelledRef.current) {
        pollingTimeoutRef.current = setTimeout(() => {
          pollProgress(batchId, storedTotal);
        }, POLLING_INTERVAL_MS);
      }
    }
  }, []);

  // On mount, check localStorage for any in-progress recategorization
  useEffect(() => {
    const stored = loadFromStorage();
    if (!stored) {
      return;
    }

    cancelledRef.current = false;
    setProgress(prev => ({
      ...prev,
      batchId: stored.batchId,
      total: stored.total,
      isShowing: true,
    }));

    pollProgress(stored.batchId, stored.total);

    return () => {
      stopPolling();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing: stable callbacks
  }, []);

  const startTracking = useCallback(
    (batchId: string, total: number) => {
      stopPolling();
      cancelledRef.current = false;
      isPollingRef.current = false;
      zeroTotalStreakRef.current = 0;

      const stored: StoredProgress = {
        batchId,
        total,
        startedAt: new Date().toISOString(),
      };
      saveToStorage(stored);

      setProgress({
        batchId,
        total,
        completed: 0,
        failed: 0,
        pending: total,
        isComplete: false,
        isShowing: true,
      });

      pollProgress(batchId, total);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing
    [stopPolling, pollProgress]
  );

  const dismiss = useCallback(() => {
    stopPolling();
    clearStorage();
    setProgress({
      batchId: null,
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      isComplete: false,
      isShowing: false,
    });
  }, [stopPolling]);

  return { progress, startTracking, dismiss };
};
