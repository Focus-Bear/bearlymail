import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { TOAST_DURATION_MS } from 'constants/numbers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useApiKeys = () => {
  const { t } = useTranslation();
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

  const connectGitHub = useCallback(() => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_URL}/github/connect`;
  }, []);

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
    disconnectGitHub,
  };
};


