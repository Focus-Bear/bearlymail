import { useCallback } from 'react';
import axios from 'axios';
import { InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { MODE_FOLLOW_UP } from 'constants/strings';

interface UseInboxSplitViewHandlersParams {
  mode: InboxMode;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
}

interface UseInboxSplitViewHandlersResult {
  handleSplitViewArchive: (emailId: string) => void;
  handleSplitViewSnooze: (emailId: string) => void;
  handleSplitViewPrioritySet: (emailId: string, starCount: number) => void;
  handleSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
}

export function useInboxSplitViewHandlers({
  mode,
  onSplitViewArchive,
  onSplitViewSnooze,
  onSplitViewPrioritySet,
  updateDraft,
  bulkSend,
  fetchThreadsWithDrafts,
}: UseInboxSplitViewHandlersParams): UseInboxSplitViewHandlersResult {
  const handleSplitViewArchive = useCallback(
    (emailId: string) => {
      if (onSplitViewArchive && emailId) {
        onSplitViewArchive(emailId);
      }
      if (mode === MODE_FOLLOW_UP) {
        fetchThreadsWithDrafts();
      }
    },
    [mode, onSplitViewArchive, fetchThreadsWithDrafts]
  );

  const handleSplitViewSnooze = useCallback(
    (emailId: string) => {
      if (onSplitViewSnooze && emailId) {
        onSplitViewSnooze(emailId);
      }
    },
    [onSplitViewSnooze]
  );

  const handleSplitViewPrioritySet = useCallback(
    (emailId: string, starCount: number) => {
      if (onSplitViewPrioritySet && emailId) {
        onSplitViewPrioritySet(emailId, starCount);
      }
    },
    [onSplitViewPrioritySet]
  );

  const handleSendFollowUp = useCallback(
    async (followUpId: string, draft: string, recipientName?: string) => {
      try {
        const response = await axios.post(`${API_URL}/follow-ups/${followUpId}/review-draft`, {
          draft,
          recipientName,
        });
        if (response.data !== draft && updateDraft) {
          await updateDraft(followUpId, response.data);
        }
        if (bulkSend) {
          await bulkSend([followUpId]);
        }
        fetchThreadsWithDrafts();
      } catch (error) {
        console.error('Error reviewing or sending follow-up:', error);
        if (bulkSend) {
          await bulkSend([followUpId]);
        }
        fetchThreadsWithDrafts();
      }
    },
    [updateDraft, bulkSend, fetchThreadsWithDrafts]
  );

  return {
    handleSplitViewArchive,
    handleSplitViewSnooze,
    handleSplitViewPrioritySet,
    handleSendFollowUp,
  };
}
