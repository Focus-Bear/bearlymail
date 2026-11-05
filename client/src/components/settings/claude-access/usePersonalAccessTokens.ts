import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { PERSONAL_ACCESS_TOKENS_ENDPOINT } from 'constants/claudeAccess';

import { CreatedPersonalAccessToken, CreatePersonalAccessTokenInput, PersonalAccessToken } from './types';

const TOKENS_URL = `${API_URL}${PERSONAL_ACCESS_TOKENS_ENDPOINT}`;
const STEP_UP_TOKEN_HEADER = 'X-Step-Up-Token';

/**
 * Lists, creates and revokes the user's personal access tokens. Create and
 * revoke reject on failure so the caller can show its own message.
 */
export function usePersonalAccessTokens() {
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const res = await axios.get<PersonalAccessToken[]>(TOKENS_URL);
      setTokens(res.data);
    } catch (err: unknown) {
      console.error('Failed to load access tokens:', err);
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  const createToken = useCallback(
    async (input: CreatePersonalAccessTokenInput, stepUpToken: string): Promise<CreatedPersonalAccessToken> => {
      const res = await axios.post<CreatedPersonalAccessToken>(TOKENS_URL, input, {
        headers: { [STEP_UP_TOKEN_HEADER]: stepUpToken },
      });
      setTokens((previous) => [res.data.summary, ...previous]);
      return res.data;
    },
    []
  );

  const revokeToken = useCallback(async (tokenId: string): Promise<void> => {
    await axios.delete(`${TOKENS_URL}/${tokenId}`);
    setTokens((previous) => previous.filter((token) => token.id !== tokenId));
  }, []);

  return { tokens, isLoading, hasLoadError, createToken, revokeToken };
}
