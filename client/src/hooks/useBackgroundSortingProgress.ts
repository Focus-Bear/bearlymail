import { useEffect, useState } from 'react';
import axios from 'axios';
import { clearBackgroundSorting, isWatchingBackgroundSorting } from 'utils/backgroundSorting';

import {
  CATEGORISATION_PROGRESS_PATH,
  type CategorisationProgress,
  isCategorisationComplete,
  isCategorisationProgress,
} from 'components/setup-wizard/useCategorisationProgress';
import { API_URL } from 'config/api';

/** Slower than the wizard's poll: this runs behind the inbox, not on a screen waiting for it. */
export const BACKGROUND_SORTING_POLL_MS = 5000;

/**
 * Progress of the inbox sort onboarding left running in the background, or
 * null when there is none to show (never started, finished, or too old). A
 * failed poll is logged and retried: it never blocks the inbox.
 */
export function useBackgroundSortingProgress(): CategorisationProgress | null {
  const [progress, setProgress] = useState<CategorisationProgress | null>(null);
  const [isWatching, setIsWatching] = useState(isWatchingBackgroundSorting);

  useEffect(() => {
    if (!isWatching) {
      return undefined;
    }
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const stopWatching = () => {
      clearBackgroundSorting();
      setProgress(null);
      setIsWatching(false);
    };
    const poll = async () => {
      if (!isWatchingBackgroundSorting()) {
        stopWatching();
        return;
      }
      try {
        const response = await axios.get<unknown>(`${API_URL}${CATEGORISATION_PROGRESS_PATH}`);
        if (isCancelled) {
          return;
        }
        if (isCategorisationProgress(response.data)) {
          if (isCategorisationComplete(response.data)) {
            stopWatching();
            return;
          }
          setProgress(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch background sorting progress:', error);
      }
      if (!isCancelled) {
        pollTimer = setTimeout(poll, BACKGROUND_SORTING_POLL_MS);
      }
    };
    poll();
    return () => {
      isCancelled = true;
      clearTimeout(pollTimer);
    };
  }, [isWatching]);

  return isWatching ? progress : null;
}
