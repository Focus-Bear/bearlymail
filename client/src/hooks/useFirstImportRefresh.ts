import { useEffect, useRef } from 'react';

import { FIRST_IMPORT_REFRESH_INTERVAL_MS } from 'constants/numbers';

interface UseFirstImportRefreshParams {
  /** True while the AI is still scoring imported threads (priority counts report unprioritised > 0). */
  isImportRunning: boolean;
  onRefresh: () => void;
}

/**
 * Re-runs `onRefresh` on an interval while the first import is still being scored. The priority
 * counts are otherwise fetched once on arrival, so a new user's guided High view never learned
 * that High mail had arrived.
 */
export function useFirstImportRefresh({ isImportRunning, onRefresh }: UseFirstImportRefreshParams): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!isImportRunning) {
      return;
    }
    const interval = setInterval(() => onRefreshRef.current(), FIRST_IMPORT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isImportRunning]);
}
