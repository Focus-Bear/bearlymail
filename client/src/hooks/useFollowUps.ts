import { useCallback, useState } from 'react';
import axios from 'axios';
import { Email } from 'types/email';
import { getAxiosErrorMessage } from 'utils/errors';

import { API_URL } from 'config/api';
import { MAX_BULK_SEND_COUNT, POLLING_INTERVAL_MS, POLLING_TIMEOUT_5_MIN_MS } from 'constants/numbers';
import { FOLLOW_UP_SEND_STATUS_FAILED, FOLLOW_UP_SEND_STATUS_SENT } from 'constants/strings';
import { useFollowUpPolling } from 'hooks/useFollowUpPolling';

export interface FollowUpData {
  id: string;
  draftFollowUp: string | null;
  generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
  generationError: string | null;
  sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
  sendError: string | null;
}

export interface ThreadWithFollowUp extends Email {
  followUp: FollowUpData | null;
}

function allTargetedFollowUpsSent(threads: ThreadWithFollowUp[], followUpIds: string[]): boolean {
  return threads.every(thread => {
    if (!thread.followUp || !followUpIds.includes(thread.followUp.id)) {
      return true;
    }
    return (
      thread.followUp.sendStatus === FOLLOW_UP_SEND_STATUS_SENT ||
      thread.followUp.sendStatus === FOLLOW_UP_SEND_STATUS_FAILED
    );
  });
}

function startSendStatusPolling(
  followUpIds: string[],
  threads: ThreadWithFollowUp[],
  fetchThreadsWithDrafts: () => Promise<ThreadWithFollowUp[]>
): void {
  const pollInterval = setInterval(async () => {
    try {
      await fetchThreadsWithDrafts();
      if (allTargetedFollowUpsSent(threads, followUpIds)) {
        clearInterval(pollInterval);
      }
    } catch (err) {
      console.error('Error polling send status:', err);
    }
  }, POLLING_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(pollInterval);
  }, POLLING_TIMEOUT_5_MIN_MS);
}

export const useFollowUps = () => {
  const [threads, setThreads] = useState<ThreadWithFollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Map<string, string>>(new Map());

  const fetchThreadsWithDrafts = useCallback(async (): Promise<ThreadWithFollowUp[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/follow-ups/threads`);
      const threadsData = response.data as ThreadWithFollowUp[];
      setThreads(threadsData);
      return threadsData;
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Failed to fetch threads'));
      console.error('Error fetching threads with drafts:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const { startGenerationPolling } = useFollowUpPolling({
    setGenerationProgress,
    setIsGeneratingDrafts,
    setThreads,
    fetchThreadsWithDrafts,
  });

  const generateDrafts = useCallback(
    async (threadIds: string[]) => {
      setIsGeneratingDrafts(true);
      setError(null);
      try {
        await axios.post(`${API_URL}/follow-ups/generate-drafts-for-threads`, { threadIds });
        startGenerationPolling();
      } catch (err: unknown) {
        setError(getAxiosErrorMessage(err, 'Failed to generate drafts'));
        setIsGeneratingDrafts(false);
        console.error('Error generating drafts:', err);
      }
    },
    [startGenerationPolling, setIsGeneratingDrafts, setError]
  );

  const updateDraft = useCallback(
    async (followUpId: string, draft: string) => {
      try {
        await axios.put(`${API_URL}/follow-ups/${followUpId}/draft`, { draft });
        await fetchThreadsWithDrafts();
      } catch (err: unknown) {
        setError(getAxiosErrorMessage(err, 'Failed to update draft'));
        throw err;
      }
    },
    [fetchThreadsWithDrafts]
  );

  const bulkSend = useCallback(
    async (followUpIds: string[]) => {
      if (followUpIds.length > MAX_BULK_SEND_COUNT) {
        throw new Error(`Maximum ${MAX_BULK_SEND_COUNT} follow-ups allowed per bulk send`);
      }
      setError(null);
      try {
        const response = await axios.post(`${API_URL}/follow-ups/bulk-send`, { followUpIds });
        startSendStatusPolling(followUpIds, threads, fetchThreadsWithDrafts);
        return response.data;
      } catch (err: unknown) {
        setError(getAxiosErrorMessage(err, 'Failed to send follow-ups'));
        throw err;
      }
    },
    [fetchThreadsWithDrafts, threads]
  );

  return {
    threads,
    loading,
    error,
    isGeneratingDrafts,
    generationProgress,
    fetchThreadsWithDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
  };
};
