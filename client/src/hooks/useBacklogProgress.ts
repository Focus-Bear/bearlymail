import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

const BACKLOG_PROGRESS_REFETCH_INTERVAL_MS = 10_000;

export interface BacklogProgress {
  remaining: number;
  isProcessing: boolean;
}

async function fetchBacklogProgress(): Promise<BacklogProgress> {
  const response = await axios.get<BacklogProgress>(`${API_URL}/emails/backlog-progress`);
  return response.data;
}

export function useBacklogProgress() {
  return useQuery({
    queryKey: ['backlog-progress'],
    queryFn: fetchBacklogProgress,
    refetchInterval: query => {
      const queryData = query.state.data;
      return queryData?.isProcessing ? BACKLOG_PROGRESS_REFETCH_INTERVAL_MS : false;
    },
    staleTime: 5_000,
  });
}
