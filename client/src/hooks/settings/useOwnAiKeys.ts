import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { AI_KEYS_ENDPOINT, type AiProviderId } from 'constants/ownAiAccount';

/** One provider's key as the server reports it: never the key itself. */
export interface AiKeyStatus {
  provider: AiProviderId;
  hasKey: boolean;
  /** e.g. "sk-ant-••••a1B2". */
  maskedKey: string | null;
  /** ISO time the provider last refused the key. */
  rejectedAt: string | null;
}

interface AiKeysResponse {
  providers: AiKeyStatus[];
}

const providerEndpoint = (provider: AiProviderId) => `${API_URL}${AI_KEYS_ENDPOINT}/${provider}`;

/**
 * The user's own AI provider keys ("Use your own AI account"). Saving sends the
 * key once; every response carries only masked values.
 */
export function useOwnAiKeys() {
  const [statuses, setStatuses] = useState<AiKeyStatus[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchStatuses = useCallback(async () => {
    try {
      const response = await axios.get<AiKeysResponse>(`${API_URL}${AI_KEYS_ENDPOINT}`);
      setStatuses(response.data.providers);
    } catch (error) {
      console.error('Error fetching AI key status:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  /** Throws the axios error so the caller can show the server's validation message. */
  const saveKey = useCallback(async (provider: AiProviderId, key: string) => {
    const response = await axios.post<AiKeysResponse>(providerEndpoint(provider), { key });
    setStatuses(response.data.providers);
  }, []);

  const removeKey = useCallback(async (provider: AiProviderId) => {
    const response = await axios.delete<AiKeysResponse>(providerEndpoint(provider));
    setStatuses(response.data.providers);
  }, []);

  const statusFor = useCallback(
    (provider: AiProviderId) => statuses.find(status => status.provider === provider),
    [statuses]
  );

  const hasAnyKey = statuses.some(status => status.hasKey);

  return { isLoaded, hasAnyKey, statusFor, saveKey, removeKey };
}
