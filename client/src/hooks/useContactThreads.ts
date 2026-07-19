import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { FILTER_ROLE_ALL } from 'constants/strings';

export type ContactThreadRole = 'from' | 'to' | 'cc';
export type ContactThreadRoleFilter = ContactThreadRole | 'all';

export interface ContactThread {
  emailThreadId: string;
  threadId: string;
  subject: string | null;
  from: string | null;
  fromName: string | null;
  receivedAt: string;
  isRead: boolean;
  role: ContactThreadRole;
}

export function useContactThreads(contactId?: string) {
  const [threads, setThreads] = useState<ContactThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<ContactThreadRoleFilter>('all');

  const fetchThreads = useCallback(async () => {
    if (!contactId) {
      return;
    }
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await axios.get<ContactThread[]>(`${API_URL}/contacts/${contactId}/threads`);
      setThreads(response.data);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const filteredThreads = useMemo(() => {
    let result = threads;

    if (roleFilter !== FILTER_ROLE_ALL) {
      result = result.filter(thread => thread.role === roleFilter);
    }

    const trimmedKeyword = keyword.trim().toLowerCase();
    if (trimmedKeyword) {
      result = result.filter(thread => {
        const subjectMatch = thread.subject?.toLowerCase().includes(trimmedKeyword) ?? false;
        const fromMatch =
          (thread.from?.toLowerCase().includes(trimmedKeyword) ?? false) ||
          (thread.fromName?.toLowerCase().includes(trimmedKeyword) ?? false);
        return subjectMatch || fromMatch;
      });
    }

    return result;
  }, [threads, roleFilter, keyword]);

  return {
    threads: filteredThreads,
    totalCount: threads.length,
    isLoading,
    hasError,
    keyword,
    setKeyword,
    roleFilter,
    setRoleFilter,
  };
}
