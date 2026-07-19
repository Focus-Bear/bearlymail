import { useCallback } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_2_MIN_MS } from 'constants/numbers';
import {
  DRAFT_STATUS_COMPLETED,
  DRAFT_STATUS_ERROR,
  DRAFT_STATUS_GENERATING,
  DRAFT_STATUS_PENDING,
} from 'constants/strings';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface UseFollowUpPollingProps {
  setGenerationProgress: (progress: Map<string, string>) => void;
  setIsGeneratingDrafts: (isGenerating: boolean) => void;
  setThreads: (threads: ThreadWithFollowUp[]) => void;
  fetchThreadsWithDrafts: () => Promise<ThreadWithFollowUp[]>;
}

export function useFollowUpPolling({
  setGenerationProgress,
  setIsGeneratingDrafts,
  setThreads,
  fetchThreadsWithDrafts,
}: UseFollowUpPollingProps) {
  const startGenerationPolling = useCallback(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/follow-ups/threads`);
        const updatedThreads = response.data as ThreadWithFollowUp[];

        // Update generation progress
        const progressMap = new Map<string, string>();
        updatedThreads.forEach(thread => {
          if (thread.followUp) {
            const status = thread.followUp.generationStatus;
            if (status === DRAFT_STATUS_GENERATING) {
              progressMap.set(thread.threadId, DRAFT_STATUS_GENERATING);
            } else if (status === DRAFT_STATUS_COMPLETED) {
              progressMap.set(thread.threadId, DRAFT_STATUS_COMPLETED);
            } else if (status === DRAFT_STATUS_ERROR) {
              progressMap.set(thread.threadId, DRAFT_STATUS_ERROR);
            }
          }
        });
        setGenerationProgress(progressMap);

        // Check if all are done
        const allDone = updatedThreads.every(
          thread =>
            !thread.followUp ||
            (thread.followUp.generationStatus !== DRAFT_STATUS_PENDING &&
              thread.followUp.generationStatus !== DRAFT_STATUS_GENERATING)
        );

        if (allDone) {
          clearInterval(pollInterval);
          setIsGeneratingDrafts(false);
          await fetchThreadsWithDrafts();
        } else {
          setThreads(updatedThreads);
        }
      } catch (err) {
        console.error('Error polling generation status:', err);
      }
    }, POLLING_INTERVAL_MS); // Poll every 2 seconds

    // Stop polling after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsGeneratingDrafts(false);
      fetchThreadsWithDrafts();
    }, POLLING_TIMEOUT_2_MIN_MS);

    return pollInterval;
  }, [setGenerationProgress, setIsGeneratingDrafts, setThreads, fetchThreadsWithDrafts]);

  return { startGenerationPolling };
}
