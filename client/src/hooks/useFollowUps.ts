import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';
import { Email } from '../types/email';

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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch threads');
      console.error('Error fetching threads with drafts:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const generateDrafts = useCallback(async (threadIds: string[]) => {
    setIsGeneratingDrafts(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/follow-ups/generate-drafts-for-threads`, {
        threadIds,
      });
      
      // Start polling for status updates
      const pollInterval = setInterval(async () => {
        try {
          const response = await axios.get(`${API_URL}/follow-ups/threads`);
          const updatedThreads = response.data as ThreadWithFollowUp[];
          
          // Update generation progress
          const progressMap = new Map<string, string>();
          updatedThreads.forEach(thread => {
            if (thread.followUp) {
              const status = thread.followUp.generationStatus;
              if (status === 'generating') {
                progressMap.set(thread.threadId, 'generating');
              } else if (status === 'completed') {
                progressMap.set(thread.threadId, 'completed');
              } else if (status === 'error') {
                progressMap.set(thread.threadId, 'error');
              }
            }
          });
          setGenerationProgress(progressMap);
          
          // Check if all are done
          const allDone = updatedThreads.every(
            thread => !thread.followUp || 
            (thread.followUp.generationStatus !== 'pending' && thread.followUp.generationStatus !== 'generating')
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
      }, 2000); // Poll every 2 seconds

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsGeneratingDrafts(false);
        fetchThreadsWithDrafts();
      }, 120000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate drafts');
      setIsGeneratingDrafts(false);
      console.error('Error generating drafts:', err);
    }
  }, [fetchThreadsWithDrafts]);

  const updateDraft = useCallback(async (followUpId: string, draft: string) => {
    try {
      await axios.put(`${API_URL}/follow-ups/${followUpId}/draft`, { draft });
      await fetchThreadsWithDrafts();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update draft');
      throw err;
    }
  }, [fetchThreadsWithDrafts]);

  const bulkSend = useCallback(async (followUpIds: string[]) => {
    if (followUpIds.length > 20) {
      throw new Error('Maximum 20 follow-ups allowed per bulk send');
    }

    setError(null);
    try {
      const response = await axios.post(`${API_URL}/follow-ups/bulk-send`, {
        followUpIds,
      });
      
      // Poll for send status
      const pollInterval = setInterval(async () => {
        try {
          await fetchThreadsWithDrafts();
          // Check if all are sent
          const allSent = threads.every(thread => {
            if (!thread.followUp || !followUpIds.includes(thread.followUp.id)) {
              return true;
            }
            return thread.followUp.sendStatus === 'sent' || thread.followUp.sendStatus === 'failed';
          });
          
          if (allSent) {
            clearInterval(pollInterval);
          }
        } catch (err) {
          console.error('Error polling send status:', err);
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 300000);

      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send follow-ups');
      throw err;
    }
  }, [fetchThreadsWithDrafts, threads]);

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



