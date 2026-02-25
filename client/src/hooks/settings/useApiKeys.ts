import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { TOAST_DURATION_MS } from 'constants/numbers';
import { API_URL } from 'config/api';
import { useAuth } from 'contexts/AuthContext';

export const useApiKeys = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      setOpenAiApiKey('');
      setHasGithubToken(!!response.data.githubToken);
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

  const connectGitHub = useCallback(async () => {
    if (!user?.id) {
      console.error('Cannot connect GitHub: user not authenticated');
      alert(t('settings.githubConnectError'));
      return;
    }

    try {
      // First, get a signed connect token from the backend
      const response = await axios.post(`${API_URL}/github/create-connect-token`);
      const { token } = response.data;

      // Then redirect to the connect endpoint with the signed token
      window.location.href = `${API_URL}/github/connect?token=${encodeURIComponent(token)}`;
    } catch (error) {
      console.error('Error creating GitHub connect token:', error);
      alert(t('settings.githubConnectError'));
    }
  }, [user, t]);

  const connectGitHubWithRepoAccess = useCallback(async () => {
    if (!user?.id) {
      console.error('Cannot connect GitHub: user not authenticated');
      alert(t('settings.githubConnectError'));
      return;
    }

    try {
      // Request a connect token that includes the 'repo' scope for private repo access
      const response = await axios.post(`${API_URL}/github/create-connect-token`, { includeRepo: true });
      const { token } = response.data;

      window.location.href = `${API_URL}/github/connect?token=${encodeURIComponent(token)}`;
    } catch (error) {
      console.error('Error creating GitHub connect token with repo access:', error);
      alert(t('settings.githubConnectError'));
    }
  }, [user, t]);

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
    connectGitHub,
    connectGitHubWithRepoAccess,
    disconnectGitHub,
  };
};


