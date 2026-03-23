/**
 * useApiKeys
 *
 * Migrated initial /users/me fetch to useUserProfileQuery (TanStack Query).
 * fetchApiKeys() is kept for explicit refresh after mutations but
 * the initial data now comes from the shared cache (staleTime: 5 min).
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useUserProfileQuery } from 'queries/useUserProfileQuery';
import { getAxiosErrorMessage } from 'utils/errors';

import { API_URL } from 'config/api';
import { TOAST_DURATION_MS } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';

async function createGitHubConnectToken(
  userId: string | undefined,
  includeRepo: boolean,
  apiUrl: string
): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const response = await axios.post(
    `${apiUrl}/github/create-connect-token`,
    includeRepo ? { includeRepo: true } : undefined
  );
  return response.data.token;
}

export const useApiKeys = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);

  // Anthropic key state
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [anthropicApiKeySaved, setAnthropicApiKeySaved] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);

  // Seed initial API key presence from the shared user profile query (no extra network call)
  const { data: userProfile } = useUserProfileQuery();
  useEffect(() => {
    if (userProfile) {
      setHasGithubToken(!!userProfile.githubToken);
      setHasAnthropicKey(!!userProfile.hasAnthropicKey);
    }
  }, [userProfile]);

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      setOpenAiApiKey('');
      setHasGithubToken(!!response.data.githubToken);
      // hasAnthropicKey is returned as a boolean by the server (never the raw key)
      setHasAnthropicKey(!!response.data.hasAnthropicKey);
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  }, []);

  const saveOpenAiApiKey = useCallback(async () => {
    if (!openAiApiKey.trim()) {
      alert(t('settings.enterApiKey'));
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: openAiApiKey.trim() });
      setApiKeySaved(true);
      setOpenAiApiKey('');
      setTimeout(() => setApiKeySaved(false), TOAST_DURATION_MS);
    } catch (error) {
      console.error('Error saving API key:', error);
      alert(t('settings.apiKeyError'));
    }
  }, [openAiApiKey, t]);

  const removeOpenAiApiKey = useCallback(async () => {
    if (!window.confirm(t('settings.confirmRemoveKey'))) {
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: null });
      setOpenAiApiKey('');
      setShowApiKey(false);
      alert(t('settings.keyRemoved'));
    } catch (error) {
      console.error('Error removing API key:', error);
      alert(t('settings.keyRemoveError'));
    }
  }, [t]);

  const saveAnthropicKey = useCallback(async () => {
    if (!anthropicApiKey.trim()) {
      alert(t('settings.enterApiKey'));
      return;
    }

    try {
      await axios.post(`${API_URL}/llm/me/anthropic-key`, { key: anthropicApiKey.trim() });
      setAnthropicApiKeySaved(true);
      setHasAnthropicKey(true);
      setAnthropicApiKey('');
      setTimeout(() => setAnthropicApiKeySaved(false), TOAST_DURATION_MS);
    } catch (error: unknown) {
      console.error('Error saving Anthropic API key:', error);
      alert(getAxiosErrorMessage(error, t('settings.apiKeyError')));
    }
  }, [anthropicApiKey, t]);

  const removeAnthropicKey = useCallback(async () => {
    if (!window.confirm(t('settings.confirmRemoveKey'))) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/llm/me/anthropic-key`);
      setAnthropicApiKey('');
      setShowAnthropicKey(false);
      setHasAnthropicKey(false);
      alert(t('settings.keyRemoved'));
    } catch (error) {
      console.error('Error removing Anthropic API key:', error);
      alert(t('settings.keyRemoveError'));
    }
  }, [t]);

  const connectGitHubCommon = useCallback(
    async (includeRepo: boolean) => {
      if (!user?.id) {
        console.error('Cannot connect GitHub: user not authenticated');
        alert(t('settings.githubConnectError'));
        return;
      }
      try {
        const token = await createGitHubConnectToken(user.id, includeRepo, API_URL);
        if (token) {
          window.location.href = `${API_URL}/github/connect?token=${encodeURIComponent(token)}`;
        }
      } catch (error) {
        console.error('Error creating GitHub connect token:', error);
        alert(t('settings.githubConnectError'));
      }
    },
    [user, t]
  );

  const connectGitHub = useCallback(() => connectGitHubCommon(false), [connectGitHubCommon]);
  const connectGitHubWithRepoAccess = useCallback(() => connectGitHubCommon(true), [connectGitHubCommon]);

  const disconnectGitHub = useCallback(async () => {
    if (!window.confirm(t('settings.confirmRemoveGithubToken'))) {
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { githubToken: null });
      setHasGithubToken(false);
      alert(t('settings.githubTokenRemoved'));
    } catch (error) {
      console.error('Error removing GitHub token:', error);
      alert(t('settings.githubTokenRemoveError'));
    }
  }, [t]);

  return {
    openAiApiKey,
    showApiKey,
    apiKeySaved,
    hasGithubToken,
    setOpenAiApiKey,
    setShowApiKey,
    fetchApiKeys,
    saveOpenAiApiKey,
    removeOpenAiApiKey,
    // Anthropic
    anthropicApiKey,
    showAnthropicKey,
    anthropicApiKeySaved,
    hasAnthropicKey,
    setAnthropicApiKey,
    setShowAnthropicKey,
    saveAnthropicKey,
    removeAnthropicKey,
    connectGitHub,
    connectGitHubWithRepoAccess,
    disconnectGitHub,
  };
};
