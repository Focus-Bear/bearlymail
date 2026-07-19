import { useEffect, useState } from 'react';

import { MODE_FOLLOW_UP } from 'constants/strings';
import { FollowUpData, ThreadWithFollowUp, useFollowUps } from 'hooks/useFollowUps';

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

  const [followUpDataMap, setFollowUpDataMap] = useState<Map<string, FollowUpData>>(new Map());

  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && userId && !authLoading) {
      fetchThreadsWithDrafts();
    }
  }, [mode, userId, authLoading, fetchThreadsWithDrafts]);

  useEffect(() => {
    if (mode === MODE_FOLLOW_UP && followUpThreads.length > 0) {
      const map = new Map<string, FollowUpData>();
      followUpThreads.forEach((thread: ThreadWithFollowUp) => {
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
