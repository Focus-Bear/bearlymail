import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { InboxMode } from 'types/email';

import { API_URL } from 'config/api';

export interface PriorityCounts {
  /** Threads with COALESCE(priorityScore, 0) >= 50 */
  veryHigh: number;
  /** Threads with COALESCE(priorityScore, 0) >= 30 and < 50 */
  high: number;
  /** Threads with COALESCE(priorityScore, 0) >= 15 and < 30 */
  medium: number;
  /** Threads with COALESCE(priorityScore, 0) >= 0 and < 15 */
  low: number;
  /** Threads with COALESCE(priorityScore, 0) < 0 */
  veryLow: number;
  /** Threads with priorityScore IS NULL (analysis not yet run) */
  unprioritised: number;
}

/**
 * Hook to fetch the count of inbox threads in each priority tier.
 * Used by the progressive unlock prompt to show how many emails are
 * waiting at the next lower priority level.
 *
 * Fix #1452 bug 3: accepts `mode` parameter to filter by inbox mode (triage/action/follow-up).
 * Without mode filtering, the sum of bucket counts did not match the inbox tab total because
 * the tab uses mode-based starCount filtering (triage = starCount 0, action/follow-up = starCount > 0).
 *
 * @param mode Inbox mode — defaults to 'triage' (the primary use case).
 */
export function usePriorityCounts(mode: InboxMode = 'triage'): {
  counts: PriorityCounts | null;
  isLoading: boolean;
  fetchCounts: () => Promise<void>;
} {
  const [counts, setCounts] = useState<PriorityCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get<PriorityCounts>(`${API_URL}/emails/priority-counts`, { params: { mode } });
      setCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch priority counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, isLoading, fetchCounts };
}
