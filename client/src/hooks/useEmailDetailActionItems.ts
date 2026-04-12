/**
 * useEmailDetailActionItems.ts
 *
 * Sub-hook for action-item CRUD operations in the email detail view.
 * Extracted from useEmailDetailOperations to keep that file under max-lines.
 */
import { useCallback } from 'react';
import axios from 'axios';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { ACTION_ITEM_SOURCE_LLM } from 'constants/strings';

type ActionItem = { id?: string; description: string; isCompleted: boolean; source: string };

interface UseEmailDetailActionItemsParams {
  id: string | undefined;
  email: Email | null;
  actionItems: ActionItem[];
  newActionItem: string;
  setActionItems: (updater: ActionItem[] | ((prev: ActionItem[]) => ActionItem[])) => void;
  setNewActionItem: (value: string) => void;
  setIsGeneratingSummary: (value: boolean) => void;
}

export function useEmailDetailActionItems({
  id,
  email,
  actionItems,
  newActionItem,
  setActionItems,
  setNewActionItem,
  setIsGeneratingSummary,
}: UseEmailDetailActionItemsParams) {
  const fetchActionItems = useCallback(async () => {
    if (!email?.id) {
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
      setActionItems(response.data);
    } catch (error) {
      console.error('Error fetching action items:', error);
    }
  }, [email?.id, setActionItems]);

  const handleExtractActions = useCallback(async () => {
    if (!id || !email?.body) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.ACTION_ITEMS_EXTRACT_CLICKED, { email_id: id });
    setIsGeneratingSummary(true);
    try {
      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        subject: email.subject,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
        existingActions: actionItems.map(item => item.description).filter(Boolean),
        isSentEmail: email.labels?.includes('SENT') ?? false,
      });
      const newItems: Array<{ description: string; isCompleted: boolean; source: string }> = response.data.map(
        (item: { description: string; source?: string }) => ({
          description: item.description,
          isCompleted: false,
          source: ACTION_ITEM_SOURCE_LLM,
        })
      );
      await Promise.all(
        newItems.map(item =>
          axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
        )
      );
      fetchActionItems();
    } catch (error) {
      console.error('Error extracting actions:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, actionItems, setIsGeneratingSummary, fetchActionItems]);

  const handleAddActionItem = useCallback(async () => {
    if (!newActionItem.trim() || !email?.id) {
      return;
    }
    try {
      await axios.post(`${API_URL}/action-items`, {
        description: newActionItem,
        emailId: email.id,
        emailThreadId: email.threadId,
        source: 'user',
      });
      setNewActionItem('');
      fetchActionItems();
    } catch (error) {
      console.error('Error adding action item:', error);
    }
  }, [newActionItem, email, setNewActionItem, fetchActionItems]);

  const handleToggleActionItem = useCallback(
    async (itemId: string, completed: boolean) => {
      try {
        setActionItems(prev => prev.map(item => (item.id === itemId ? { ...item, isCompleted: completed } : item)));
        await axios.put(`${API_URL}/action-items/${itemId}`, { isCompleted: completed });
      } catch (error) {
        console.error('Error toggling action item:', error);
        fetchActionItems();
      }
    },
    [setActionItems, fetchActionItems]
  );

  const handleDeleteActionItem = useCallback(
    async (itemId: string) => {
      try {
        await axios.delete(`${API_URL}/action-items/${itemId}`);
        fetchActionItems();
      } catch (error) {
        console.error('Error deleting action item:', error);
      }
    },
    [fetchActionItems]
  );

  const handleRegenerateActionItems = useCallback(async () => {
    if (!id || !email?.body) {
      return;
    }
    setIsGeneratingSummary(true);
    try {
      const llmItems = actionItems.filter(item => item.source === ACTION_ITEM_SOURCE_LLM);
      await Promise.all(
        llmItems.map(item => (item.id ? axios.delete(`${API_URL}/action-items/${item.id}`) : Promise.resolve()))
      );

      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        subject: email.subject,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
        isSentEmail: email.labels?.includes('SENT') ?? false,
      });
      const newItems: Array<{ description: string; isCompleted: boolean; source: string }> = response.data.map(
        (item: { description: string; source?: string }) => ({
          description: item.description,
          isCompleted: false,
          source: ACTION_ITEM_SOURCE_LLM,
        })
      );
      await Promise.all(
        newItems.map(item =>
          axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
        )
      );
      fetchActionItems();
    } catch (error) {
      console.error('Error regenerating action items:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, actionItems, setIsGeneratingSummary, fetchActionItems]);

  return {
    fetchActionItems,
    handleExtractActions,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleRegenerateActionItems,
  };
}
