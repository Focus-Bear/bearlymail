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

import { API_URL } from 'config/api';
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
  const [hasGithubToken, setHasGithubToken] = useState(false);

  // Seed initial token presence from the shared user profile query (no extra network call)
  const { data: userProfile } = useUserProfileQuery();
  useEffect(() => {
    if (userProfile) {
      setHasGithubToken(!!userProfile.githubToken);
    }
  }, [userProfile]);

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      setHasGithubToken(!!response.data.githubToken);
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  }, []);

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
    hasGithubToken,
    fetchApiKeys,
    connectGitHub,
    connectGitHubWithRepoAccess,
    disconnectGitHub,
  };
};
