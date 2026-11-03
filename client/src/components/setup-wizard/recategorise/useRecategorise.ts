import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { MS_PER_MINUTE, POLLING_INTERVAL_MS } from 'constants/numbers';
import { MODE_TRIAGE } from 'constants/strings';

import {
  type CategoryCount,
  isBatchFinished,
  isCategoryCountList,
  isJobProgress,
  RECATEGORISE_STATUS,
  type RecategoriseJobProgress,
  type RecategoriseStartResponse,
  type RecategoriseStatus,
} from './recategorise';

const START_PATH = `/emails/recategorize-triage?modes=${MODE_TRIAGE}`;
const PROGRESS_PATH = '/emails/recategorize-progress';
const COUNTS_PATH = '/onboarding/category-counts';
/**
 * Longest the learning step holds the user on a re-sort. Past it the jobs keep
 * running server-side and the inbox finishes sorting itself, so a stuck job
 * can never trap the user.
 */
export const RECATEGORISE_MAX_WAIT_MINUTES = 5;
const RECATEGORISE_MAX_WAIT_MS = RECATEGORISE_MAX_WAIT_MINUTES * MS_PER_MINUTE;

export interface RecategoriseState {
  status: RecategoriseStatus;
  progress: RecategoriseJobProgress | null;
  counts: CategoryCount[];
  /** The user changed their categories since the inbox was last sorted. */
  hasUnsortedCategoryChanges: boolean;
  markCategoriesChanged: () => void;
  /** Re-sorts the onboarding (triage) threads with the user's current categories. */
  start: () => Promise<void>;
}

async function fetchCounts(): Promise<CategoryCount[] | null> {
  const response = await axios.get<unknown>(`${API_URL}${COUNTS_PATH}`);
  return isCategoryCountList(response.data) ? response.data : null;
}

async function fetchJobProgress(batchId: string): Promise<RecategoriseJobProgress | null> {
  const response = await axios.get<unknown>(`${API_URL}${PROGRESS_PATH}`, { params: { batchId } });
  return isJobProgress(response.data) ? response.data : null;
}

/**
 * Drives the onboarding "Re-categorise" action: queues a re-sort of the triage
 * inbox, then polls the job batch and the per-category counts so the user
 * watches emails move into their new categories.
 */
export function useRecategorise(): RecategoriseState {
  const [status, setStatus] = useState<RecategoriseStatus>(RECATEGORISE_STATUS.IDLE);
  const [progress, setProgress] = useState<RecategoriseJobProgress | null>(null);
  const [counts, setCounts] = useState<CategoryCount[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [hasUnsortedCategoryChanges, setHasUnsortedCategoryChanges] = useState(false);
  const isMountedRef = useRef(true);
  const markCategoriesChanged = useCallback(() => setHasUnsortedCategoryChanges(true), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshCounts = useCallback(async () => {
    const latest = await fetchCounts();
    if (latest && isMountedRef.current) {
      setCounts(latest);
    }
  }, []);

  const start = useCallback(async () => {
    setHasUnsortedCategoryChanges(false);
    // Drop the previous batch first so polling can't read its finished state as this run's.
    setBatchId(null);
    setStatus(RECATEGORISE_STATUS.RUNNING);
    setProgress(null);
    try {
      const response = await axios.post<RecategoriseStartResponse>(`${API_URL}${START_PATH}`);
      if (!response.data.batchId || response.data.queued === 0) {
        await refreshCounts();
        setStatus(RECATEGORISE_STATUS.DONE);
        return;
      }
      setBatchId(response.data.batchId);
    } catch (error) {
      console.error('Failed to start re-categorisation:', error);
      setStatus(RECATEGORISE_STATUS.ERROR);
    }
  }, [refreshCounts]);

  useBatchPolling(batchId, status, { setProgress, setStatus, refreshCounts, isMountedRef });

  return { status, progress, counts, hasUnsortedCategoryChanges, markCategoriesChanged, start };
}

interface BatchPollingDeps {
  setProgress: (progress: RecategoriseJobProgress) => void;
  setStatus: (status: RecategoriseStatus) => void;
  refreshCounts: () => Promise<void>;
  isMountedRef: MutableRefObject<boolean>;
}

/** Polls a running batch until every job finishes or the max wait passes. */
function useBatchPolling(batchId: string | null, status: RecategoriseStatus, deps: BatchPollingDeps): void {
  const { setProgress, setStatus, refreshCounts, isMountedRef } = deps;

  useEffect(() => {
    if (!batchId || status !== RECATEGORISE_STATUS.RUNNING) {
      return undefined;
    }
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const giveUpTimer = setTimeout(() => setStatus(RECATEGORISE_STATUS.DONE), RECATEGORISE_MAX_WAIT_MS);

    const poll = async () => {
      try {
        const [jobProgress] = await Promise.all([fetchJobProgress(batchId), refreshCounts()]);
        if (!isMountedRef.current) {
          return;
        }
        if (jobProgress) {
          setProgress(jobProgress);
          if (isBatchFinished(jobProgress)) {
            setStatus(RECATEGORISE_STATUS.DONE);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to fetch re-categorisation progress:', error);
      }
      pollTimer = setTimeout(poll, POLLING_INTERVAL_MS);
    };
    poll();

    return () => {
      clearTimeout(pollTimer);
      clearTimeout(giveUpTimer);
    };
  }, [batchId, status, setProgress, setStatus, refreshCounts, isMountedRef]);
}
