import { useCallback } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

/**
 * Provides simple CRUD callbacks for email draft storage.
 * Extracted from useEmailDetailOperations to keep hook sizes manageable.
 */
export function useEmailDraftCrud(threadId: string | undefined) {
  const fetchDraft = useCallback(async () => {
    if (!threadId) {
      return null;
    }
    try {
      const response = await axios.get(`${API_URL}/drafts/thread/${threadId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }, [threadId]);

  const saveDraft = useCallback(
    async (content: string, mode: 'reply' | 'replyAll' | 'forward', recipients: string, explicitThreadId?: string) => {
      const target = explicitThreadId || threadId;
      if (!target || !content.trim()) {
        return;
      }
      try {
        await axios.post(`${API_URL}/drafts/thread/${target}`, { content, replyMode: mode, recipients });
      } catch (error) {
        console.error('Error saving draft:', error);
      }
    },
    [threadId]
  );

  const deleteDraft = useCallback(async () => {
    if (!threadId) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/drafts/thread/${threadId}`);
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }, [threadId]);

  return { fetchDraft, saveDraft, deleteDraft };
}
