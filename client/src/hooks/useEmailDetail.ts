/**
 * @deprecated This hook is not used by any live component. It predates the current
 * `useEmailDetailFetching` / `useEmailDetailState` / `useEmailDetailOperations` architecture.
 * Retained only because its test file (`useEmailDetail.test.ts`) provides coverage for the
 * underlying API shape. Will be deleted in a follow-up cleanup once those tests are migrated.
 * See #698 for context.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  priorityScore: number;
  isRead: boolean;
  receivedAt: string;
  summary?: string | null;
  isProcessingSummary?: boolean;
}

interface UseEmailDetailResult {
  email: Email | null;
  threadEmails: Email[];
  expandedThreadItems: Set<string>;
  loading: boolean;
  toggleThreadItem: (id: string) => void;
}

/**
 * Custom hook for fetching and managing email detail data
 */
export const useEmailDetail = (emailId: string): UseEmailDetailResult => {
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchEmail = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/emails/${emailId}`);
      setEmail(response.data);

      if (response.data.threadId) {
        try {
          const threadResponse = await axios.get(`${API_URL}/emails/thread/${response.data.threadId}`);
          setThreadEmails(threadResponse.data);
          setExpandedThreadItems(new Set([emailId]));
        } catch (error) {
          console.error('Error fetching thread:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const toggleThreadItem = (id: string) => {
    setExpandedThreadItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return {
    email,
    threadEmails,
    expandedThreadItems,
    loading,
    toggleThreadItem,
  };
};
