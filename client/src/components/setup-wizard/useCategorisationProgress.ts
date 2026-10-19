import { useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { MS_PER_MINUTE, POLLING_INTERVAL_MS } from 'constants/numbers';

/** Longest we hold the user on the learning step waiting for categorisation once learning is done. */
export const CATEGORISATION_MAX_WAIT_MINUTES = 3;
const CATEGORISATION_MAX_WAIT_MS = CATEGORISATION_MAX_WAIT_MINUTES * MS_PER_MINUTE;
const CATEGORISATION_PROGRESS_PATH = '/onboarding/categorisation-progress';

export interface CategorisationProgress {
  total: number;
  categorised: number;
}

export interface CategorisationState {
  progress: CategorisationProgress | null;
  timedOut: boolean;
}

function isCategorisationProgress(value: unknown): value is CategorisationProgress {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.total === 'number' && typeof candidate.categorised === 'number';
}

/** True once every untriaged inbox thread has a settled category (an empty inbox counts as sorted). */
export function isCategorisationComplete(progress: CategorisationProgress | null): boolean {
  return progress !== null && progress.categorised >= progress.total;
}

/**
 * Polls how many inbox threads have been categorised so onboarding can keep
 * the user out of a still-unsorted inbox. Polling stops once learning is done
 * and everything is sorted; the max-wait clock starts when learning finishes,
 * so a stuck job can never trap the user.
 */
export function useCategorisationProgress(isLearningDone: boolean): CategorisationState {
  const [progress, setProgress] = useState<CategorisationProgress | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const isSettled = isLearningDone && isCategorisationComplete(progress);

  useEffect(() => {
    if (isSettled) {
      return undefined;
    }
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await axios.get<unknown>(`${API_URL}${CATEGORISATION_PROGRESS_PATH}`);
        if (!isCancelled && isCategorisationProgress(response.data)) {
          setProgress(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch categorisation progress:', error);
      }
      if (!isCancelled) {
        pollTimer = setTimeout(poll, POLLING_INTERVAL_MS);
      }
    };
    poll();
    return () => {
      isCancelled = true;
      clearTimeout(pollTimer);
    };
  }, [isSettled]);

  useEffect(() => {
    if (!isLearningDone) {
      return undefined;
    }
    const timeoutId = setTimeout(() => setTimedOut(true), CATEGORISATION_MAX_WAIT_MS);
    return () => clearTimeout(timeoutId);
  }, [isLearningDone]);

  return { progress, timedOut };
}
