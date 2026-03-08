import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: string;
}

export const useBlockedSenders = () => {
  const [blockedSenders, setBlockedSenders] = useState<BlockedSender[]>([]);

  const fetchBlockedSenders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/blocked-senders`);
      setBlockedSenders(response.data);
    } catch (error) {
      console.error('Error fetching blocked senders:', error);
      setBlockedSenders([]);
    }
  }, []);

  const removeBlockedSender = useCallback(
    async (id: string) => {
      const deletedSender = blockedSenders.find(sender => sender.id === id);
      setBlockedSenders(prev => prev.filter(sender => sender.id !== id));

      try {
        await axios.delete(`${API_URL}/blocked-senders/${id}`);
      } catch (error) {
        console.error('Error unblocking sender:', error);
        if (deletedSender) {
          setBlockedSenders(prev => [...prev, deletedSender]);
        }
      }
    },
    [blockedSenders]
  );

  return {
    blockedSenders,
    setBlockedSenders,
    fetchBlockedSenders,
    removeBlockedSender,
  };
};
