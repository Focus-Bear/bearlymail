import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface EmailThread {
  id: string;
  assigneeId: string | null;
}

export function useAssignThread() {
  const queryClient = useQueryClient();
  return useMutation<EmailThread, Error, { threadId: string; assigneeUserId: string }>({
    mutationFn: async ({ threadId, assigneeUserId }) => {
      const { data: threadData } = await axios.patch<EmailThread>(`${API_URL}/emails/threads/${threadId}/assign`, {
        assigneeUserId,
      });
      return threadData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useUnassignThread() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async threadId => {
      await axios.delete(`${API_URL}/emails/threads/${threadId}/assign`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}
