import { useCallback,useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

type ActionItem = { id?: string; description: string; isCompleted: boolean; source: string };

export function useEmailDetailActionItems(email: { id: string; threadId: string; body: string; from: string; fromName?: string } | null) {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [newActionItem, setNewActionItem] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const fetchActionItems = useCallback(async () => {
    if (!email?.id) return;
    try {
      const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
      setActionItems(response.data);
    } catch (error) {
      console.error('Error fetching action items:', error);
    }
  }, [email?.id]);

  useEffect(() => {
    if (email?.id) {
      fetchActionItems();
    }
  }, [email?.id, fetchActionItems]);

  const handleAddActionItem = useCallback(async () => {
    if (!newActionItem.trim() || !email?.id) return;
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
  }, [newActionItem, email, fetchActionItems]);

  const handleToggleActionItem = useCallback(async (itemId: string, completed: boolean) => {
    try {
      setActionItems((prev: ActionItem[]) => prev.map(item => item.id === itemId ? { ...item, isCompleted: completed } : item));
      await axios.put(`${API_URL}/action-items/${itemId}`, { isCompleted: completed });
    } catch (error) {
      console.error('Error toggling action item:', error);
      fetchActionItems();
    }
  }, [fetchActionItems]);

  const handleDeleteActionItem = useCallback(async (itemId: string) => {
    try {
      setActionItems((prev: ActionItem[]) => prev.filter(item => item.id !== itemId));
      await axios.delete(`${API_URL}/action-items/${itemId}`);
    } catch (error) {
      console.error('Error deleting action item:', error);
      fetchActionItems();
    }
  }, [fetchActionItems]);

  const handleExtractActions = useCallback(async () => {
    if (!email?.id || !email?.body) return;
    setIsGeneratingSummary(true);
    try {
      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
      });
      const newItems = response.data.map((item: any) => ({
        description: item.description,
        isCompleted: false,
        source: 'llm',
      }));
      await Promise.all(newItems.map((item: any) => 
        axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
      ));
      fetchActionItems();
    } catch (error) {
      console.error('Error extracting actions:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [email, fetchActionItems]);

  return {
    actionItems,
    newActionItem,
    setNewActionItem,
    isGeneratingSummary,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleExtractActions,
  };
}


