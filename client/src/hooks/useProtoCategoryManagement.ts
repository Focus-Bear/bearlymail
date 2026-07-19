import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';
import { useNotifications } from 'contexts/NotificationContext';
import { RecategorizeProgressState, useRecategorizeProgress } from 'hooks/settings/useRecategorizeProgress';
import { ProtoCategory } from 'hooks/useProtoCategories';

interface UseProtoCategoryManagementResult {
  protoCategories: ProtoCategory[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null;
  deletingProtoCategoryId: string | null;
  fetchProtoCategories: () => Promise<void>;
  handleReanalyseOther: () => Promise<void>;
  handleConvertProtoCategory: (protoCategoryId: string, name: string) => Promise<void>;
  handleDeleteProtoCategoryFromInbox: (protoCategoryId: string) => Promise<void>;
  recategorizeProgress: RecategorizeProgressState;
  dismissRecategorizeProgress: () => void;
}

export const useProtoCategoryManagement = (): UseProtoCategoryManagementResult => {
  const { t } = useTranslation();
  const { showNotification } = useNotifications();
  const {
    progress: recategorizeProgress,
    startTracking,
    dismiss: dismissRecategorizeProgress,
  } = useRecategorizeProgress();
  const [protoCategories, setProtoCategories] = useState<ProtoCategory[]>([]);
  const [isReanalysingOther, setIsReanalysingOther] = useState(false);
  const [convertingProtoCategoryId, setConvertingProtoCategoryId] = useState<string | null>(null);
  const [deletingProtoCategoryId, setDeletingProtoCategoryId] = useState<string | null>(null);

  const fetchProtoCategories = useCallback(async () => {
    try {
      const response = await axios.get<ProtoCategory[]>(`${API_URL}/proto-categories`);
      setProtoCategories(response.data);
    } catch (error) {
      console.error('Error fetching proto categories:', error);
    }
  }, []);

  const handleReanalyseOther = useCallback(async () => {
    setIsReanalysingOther(true);
    try {
      const response = await axios.post(`${API_URL}/emails/recategorize-triage`);
      const { batchId, queued, message } = response.data as {
        batchId: string | null;
        queued: number;
        message?: string;
      };
      if (batchId && queued > 0) {
        startTracking(batchId, queued);
        showNotification(t('inbox.category.recategorizeQueued', { count: queued }), 'success');
      } else {
        showNotification(message || t('inbox.category.recategorizeNone'), 'info');
      }
    } catch (error) {
      console.error('Error starting inbox recategorisation:', error);
      showNotification(t('inbox.category.recategorizeError'), 'error');
    } finally {
      setIsReanalysingOther(false);
    }
  }, [showNotification, startTracking, t]);

  const handleConvertProtoCategory = useCallback(
    async (protoCategoryId: string, name: string) => {
      if (!protoCategoryId) {
        return;
      }
      setConvertingProtoCategoryId(protoCategoryId);
      try {
        await axios.post(`${API_URL}/proto-categories/${protoCategoryId}/promote`);
        setProtoCategories(prev => prev.filter(pc => pc.id !== protoCategoryId));
        showNotification(t('inbox.protoCategory.convertSuccess', { name }), 'success');
      } catch (error) {
        console.error('Error converting proto category:', error);
        showNotification(t('inbox.protoCategory.convertError'), 'error');
      } finally {
        setConvertingProtoCategoryId(null);
      }
    },
    [showNotification, t]
  );

  const handleDeleteProtoCategoryFromInbox = useCallback(
    async (protoCategoryId: string) => {
      setDeletingProtoCategoryId(protoCategoryId);
      try {
        await axios.delete(`${API_URL}/proto-categories/${protoCategoryId}`);
        setProtoCategories(prev => prev.filter(pc => pc.id !== protoCategoryId));
      } catch (error) {
        console.error('Error deleting proto category:', error);
        showNotification(t('inbox.protoCategory.deleteError'), 'error');
      } finally {
        setDeletingProtoCategoryId(null);
      }
    },
    [showNotification, t]
  );

  return {
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    fetchProtoCategories,
    handleReanalyseOther,
    handleConvertProtoCategory,
    handleDeleteProtoCategoryFromInbox,
    recategorizeProgress,
    dismissRecategorizeProgress,
  };
};
