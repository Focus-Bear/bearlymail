import { useState, useCallback } from 'react';
import axios from 'axios';
import { Email, InboxMode } from '../types/email';
import { API_URL } from '../config/api';

interface UseEmailManagementProps {
  mode: InboxMode;
  onSuggestionRemove?: (emailId: string) => void;
}

interface UseEmailManagementReturn {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  setLoadingModeSwitch: React.Dispatch<React.SetStateAction<boolean>>;
  fetchError: string | null;
  fetchEmails: () => Promise<void>;
  handleSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<{ discrepancy: number; predictedStarCount: number } | null>;
  handleArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  handleSnooze: (emailId: string, duration: string) => Promise<void>;
  handleMarkAsRead: (emailId: string) => Promise<void>;
  handleMarkAsUnread: (emailId: string) => Promise<void>;
  handleBulkMarkAsRead: (emailIds: string[]) => Promise<void>;
  handleBulkMarkAsUnread: (emailIds: string[]) => Promise<void>;
  handleCheckUrgent: () => Promise<{ hasUrgent: boolean; count: number; emails: any[] }>;
}

export function useEmailManagement({ mode, onSuggestionRemove }: UseEmailManagementProps): UseEmailManagementReturn {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingModeSwitch, setLoadingModeSwitch] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setDecrypting(true);
    setFetchError(null);
    try {
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`, response.data);
      setEmails(response.data);
      setDecrypting(false);
      setFetchError(null);
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      setDecrypting(false);
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        setFetchError('Unable to connect to the server. Please check if the server is running.');
      } else if (error.response?.status === 401) {
        const errorMessage = error.response?.data?.message || '';
        if (errorMessage.includes('Gmail account connection required') || errorMessage.includes('Gmail')) {
          setFetchError('GMAIL_REQUIRED'); // Special error code for Gmail requirement
        } else {
          setFetchError('Please log in again to view emails.');
        }
      } else {
        setFetchError(error.response?.data?.message || error.message || 'Failed to load emails. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingModeSwitch(false);
    }
  }, [mode]);

  const handleSetStarCount = useCallback(async (emailId: string, starCount: number, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const email = emails.find(e => e.id === emailId);
    const predictedStarCount = email
      ? Math.round((email.priorityScore / 100) * 3)
      : Math.round(50 / 100 * 3);

    // Optimistic update
    setEmails(prevEmails => prevEmails.map(email =>
      email.id === emailId ? { ...email, starCount } : email
    ));

    onSuggestionRemove?.(emailId);

    try {
      await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount });

      // Refresh (non-blocking)
      fetchEmails().catch(err => console.error('Error refreshing after star update:', err));

      // Return discrepancy info for caller to handle
      const discrepancy = Math.abs(starCount - predictedStarCount);
      if (discrepancy >= 2 && starCount > 0) {
        return { discrepancy, predictedStarCount };
      }
      return null;
    } catch (error) {
      console.error('Error setting star count:', error);
      fetchEmails();
      return null;
    }
  }, [emails, fetchEmails, onSuggestionRemove]);

  const handleArchive = useCallback(async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const emailToArchive = emails.find(e => e.id === emailId);
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
    onSuggestionRemove?.(emailId);

    try {
      await axios.put(`${API_URL}/emails/${emailId}/archive`);
      fetchEmails().catch(err => console.error('Error refreshing after archive:', err));
    } catch (error) {
      console.error('Error archiving email:', error);
      if (emailToArchive) {
        setEmails(prevEmails => [...prevEmails, emailToArchive].sort((a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ));
      }
      fetchEmails();
    }
  }, [emails, fetchEmails, onSuggestionRemove]);

  const handleSnooze = useCallback(async (emailId: string, duration: string) => {
    if (!duration.trim()) {
      console.warn('Cannot snooze: duration is empty');
      return;
    }

    try {
      await axios.post(`${API_URL}/snooze/${emailId}`, { duration });
      fetchEmails();
    } catch (error: any) {
      console.error('Error snoozing email:', error);
      throw error;
    }
  }, [fetchEmails]);

  const handleMarkAsRead = useCallback(async (emailId: string) => {
    try {
      await axios.put(`${API_URL}/emails/${emailId}/read`);
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  }, []);

  const handleMarkAsUnread = useCallback(async (emailId: string) => {
    try {
      await axios.put(`${API_URL}/emails/${emailId}/unread`);
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: false } : e));
    } catch (error) {
      console.error('Error marking email as unread:', error);
    }
  }, []);

  const handleBulkMarkAsRead = useCallback(async (emailIds: string[]) => {
    if (emailIds.length === 0) return;
    
    // Optimistic update
    setEmails(prev => prev.map(e => emailIds.includes(e.id) ? { ...e, isRead: true } : e));
    onSuggestionRemove && emailIds.forEach(id => onSuggestionRemove(id));

    try {
      await axios.post(`${API_URL}/emails/bulk/read`, { emailIds });
      fetchEmails().catch(err => console.error('Error refreshing after bulk read:', err));
    } catch (error) {
      console.error('Error bulk marking emails as read:', error);
      fetchEmails(); // Revert on error
    }
  }, [fetchEmails, onSuggestionRemove]);

  const handleBulkMarkAsUnread = useCallback(async (emailIds: string[]) => {
    if (emailIds.length === 0) return;
    
    // Optimistic update
    setEmails(prev => prev.map(e => emailIds.includes(e.id) ? { ...e, isRead: false } : e));
    onSuggestionRemove && emailIds.forEach(id => onSuggestionRemove(id));

    try {
      await axios.post(`${API_URL}/emails/bulk/unread`, { emailIds });
      fetchEmails().catch(err => console.error('Error refreshing after bulk unread:', err));
    } catch (error) {
      console.error('Error bulk marking emails as unread:', error);
      fetchEmails(); // Revert on error
    }
  }, [fetchEmails, onSuggestionRemove]);

  const handleCheckUrgent = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API_URL}/emails/check-urgent`);
      return {
        hasUrgent: response.data.hasUrgent,
        count: response.data.urgentCount || 0,
        emails: response.data.urgentEmails || [],
      };
    } catch (error) {
      console.error('Error checking for urgent emails:', error);
      return { hasUrgent: false, count: 0, emails: [] };
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    emails,
    setEmails,
    loading,
    decrypting,
    refreshing,
    loadingModeSwitch,
    setLoadingModeSwitch,
    fetchError,
    fetchEmails,
    handleSetStarCount,
    handleArchive,
    handleSnooze,
    handleMarkAsRead,
    handleMarkAsUnread,
    handleBulkMarkAsRead,
    handleBulkMarkAsUnread,
    handleCheckUrgent,
  };
}
