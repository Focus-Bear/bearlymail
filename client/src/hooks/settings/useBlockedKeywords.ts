import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface BlockedKeyword {
  id: string;
  keyword: string;
  exactMatch: boolean;
  reason?: string;
  blockedAt: string;
}

export const useBlockedKeywords = () => {
  const [blockedKeywords, setBlockedKeywords] = useState<BlockedKeyword[]>([]);

  const fetchBlockedKeywords = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/blocked-keywords`);
      setBlockedKeywords(response.data);
    } catch (error) {
      console.error('Error fetching blocked keywords:', error);
      setBlockedKeywords([]);
    }
  }, []);

  const addBlockedKeyword = useCallback(async (keyword: string, exactMatch: boolean = false, reason?: string) => {
    try {
      const response = await axios.post(`${API_URL}/blocked-keywords`, {
        keyword,
        exactMatch,
        reason,
      });
      setBlockedKeywords(prev => [response.data, ...prev]);
      return response.data;
    } catch (error) {
      console.error('Error adding blocked keyword:', error);
      throw error;
    }
  }, []);

  const removeBlockedKeyword = useCallback(
    async (id: string) => {
      const deletedKeyword = blockedKeywords.find(kw => kw.id === id);
      setBlockedKeywords(prev => prev.filter(kw => kw.id !== id));

      try {
        await axios.delete(`${API_URL}/blocked-keywords/${id}`);
      } catch (error) {
        console.error('Error unblocking keyword:', error);
        if (deletedKeyword) {
          setBlockedKeywords(prev => [...prev, deletedKeyword]);
        }
      }
    },
    [blockedKeywords]
  );

  return {
    blockedKeywords,
    setBlockedKeywords,
    fetchBlockedKeywords,
    addBlockedKeyword,
    removeBlockedKeyword,
  };
};
