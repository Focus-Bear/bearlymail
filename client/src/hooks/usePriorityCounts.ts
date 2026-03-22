import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface PriorityCounts {
  /** Threads with priorityScore > 50 */
  veryHigh: number;
  /** Threads with priorityScore > 30 and <= 50 */
  high: number;
  /** Threads with priorityScore > 15 and <= 30 */
  medium: number;
  /** Threads with priorityScore >= 0 and <= 15 */
  low: number;
  /** Threads with priorityScore < 0 */
  veryLow: number;
}

/**
 * Hook to fetch the count of inbox threads in each priority tier.
 * Used by the progressive unlock prompt to show how many emails are
 * waiting at the next lower priority level.
 */
export function usePriorityCounts(): {
  counts: PriorityCounts | null;
  isLoading: boolean;
  fetchCounts: () => Promise<void>;
} {
  const [counts, setCounts] = useState<PriorityCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get<PriorityCounts>(`${API_URL}/emails/priority-counts`);
      setCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch priority counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, isLoading, fetchCounts };
}
