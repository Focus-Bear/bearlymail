import { useState, useEffect } from 'react';
import { useFollowUps } from 'hooks/useFollowUps';
import { MODE_FOLLOW_UP } from 'constants/strings';

type InboxMode = string;

/**
 * Encapsulates follow-up thread fetching and the threadId→followUpData map.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxFollowUpData(mode: InboxMode, userId: string | undefined, authLoading: boolean) {
  const {
    threads: followUpThreads,
    error: followUpsError,
    isGeneratingDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  } = useFollowUps();

  const [followUpDataMap, setFollowUpDataMap] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && userId && !authLoading) {
      fetchThreadsWithDrafts();
    }
  }, [mode, userId, authLoading, fetchThreadsWithDrafts]);

  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && followUpThreads.length > 0) {
      const map = new Map<string, any>();
      followUpThreads.forEach((thread: any) => {
        if (thread.followUp) {
          map.set(thread.threadId, thread.followUp);
        }
      });
      setFollowUpDataMap(map);
    }
  }, [mode, followUpThreads]);

  return {
    followUpThreads,
    followUpDataMap,
    followUpsError,
    isGeneratingDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  };
}
