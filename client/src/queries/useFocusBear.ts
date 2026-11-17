import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';
import { FOCUS_BEAR_API_PATHS } from 'constants/focusBear';

import { STALE_TIME_5_MIN } from './constants';
import { focusBearKeys } from './queryKeys';

export interface FocusBearConnection {
  connected: boolean;
}

export interface FocusBearProjectOption {
  id: string;
  name: string;
}

/** `POST /focus-bear/task-suggestions`: each suggestion is null when Focus Bear has none. */
export interface FocusBearTaskSuggestions {
  connected: boolean;
  project: (FocusBearProjectOption & { confidence: number }) | null;
  projects: FocusBearProjectOption[];
  /** `YYYY-MM-DD`. */
  dueDate: string | null;
}

export interface FocusBearTaskToFile {
  title: string;
  emailSubject?: string;
  sender?: string;
}

export function useFocusBearConnectionQuery() {
  return useQuery({
    queryKey: focusBearKeys.connection,
    queryFn: async () => {
      const response = await axios.get<FocusBearConnection>(`${API_URL}${FOCUS_BEAR_API_PATHS.CONNECTION}`);
      return response.data;
    },
    staleTime: STALE_TIME_5_MIN,
  });
}

export function useConnectFocusBear() {
  const queryClient = useQueryClient();
  return useMutation<FocusBearConnection, Error, string>({
    mutationFn: async token => {
      const response = await axios.put<FocusBearConnection>(`${API_URL}${FOCUS_BEAR_API_PATHS.CONNECTION}`, { token });
      return response.data;
    },
    onSuccess: connection => {
      queryClient.setQueryData(focusBearKeys.connection, connection);
      queryClient.removeQueries({ queryKey: focusBearKeys.allSuggestions });
    },
  });
}

export function useDisconnectFocusBear() {
  const queryClient = useQueryClient();
  return useMutation<FocusBearConnection, Error, void>({
    mutationFn: async () => {
      const response = await axios.delete<FocusBearConnection>(`${API_URL}${FOCUS_BEAR_API_PATHS.CONNECTION}`);
      return response.data;
    },
    onSuccess: connection => {
      queryClient.setQueryData(focusBearKeys.connection, connection);
      queryClient.removeQueries({ queryKey: focusBearKeys.allSuggestions });
    },
  });
}

/**
 * The suggested project and due date for a task, fetched once per task per session
 * (it asks Focus Bear's model, so it isn't refetched behind the user's back).
 */
export function fetchFocusBearTaskSuggestions(
  queryClient: QueryClient,
  task: FocusBearTaskToFile
): Promise<FocusBearTaskSuggestions> {
  return queryClient.fetchQuery({
    queryKey: focusBearKeys.suggestions(task.title, task.emailSubject ?? ''),
    queryFn: async () => {
      const response = await axios.post<FocusBearTaskSuggestions>(
        `${API_URL}${FOCUS_BEAR_API_PATHS.TASK_SUGGESTIONS}`,
        task
      );
      return response.data;
    },
    staleTime: Infinity,
  });
}
