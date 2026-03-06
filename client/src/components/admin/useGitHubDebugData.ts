import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';

import { GitHubDebugInfo, TokenTestResult } from './GitHubDebugSection.types';

export interface GitHubDebugData {
  debugInfo: GitHubDebugInfo | null;
  loading: boolean;
  lastUpdated: Date | null;
  testUserId: string;
  setTestUserId: (v: string) => void;
  testOwnerRepo: string;
  setTestOwnerRepo: (v: string) => void;
  tokenTestResult: TokenTestResult | null;
  testingToken: boolean;
  handleTestToken: () => void;
  fetchDebugInfo: () => void;
  formatDate: (dateStr: string | null) => string;
}

export const useGitHubDebugData = (): GitHubDebugData => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<GitHubDebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [testUserId, setTestUserId] = useState('');
  const [testOwnerRepo, setTestOwnerRepo] = useState('');
  const [tokenTestResult, setTokenTestResult] = useState<TokenTestResult | null>(null);
  const [testingToken, setTestingToken] = useState(false);

  const fetchDebugInfo = useCallback(async () => {
    try {
      const response = await axios.get<GitHubDebugInfo>(`${API_URL}/github/admin/debug`);
      setDebugInfo(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching GitHub debug info:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebugInfo();
  }, [fetchDebugInfo]);

  const handleTestToken = useCallback(async () => {
    if (!testUserId.trim()) return;
    setTestingToken(true);
    setTokenTestResult(null);
    try {
      const body: { userId: string; testOwner?: string; testRepo?: string } = { userId: testUserId.trim() };
      const trimmedOwnerRepo = testOwnerRepo.trim();
      if (trimmedOwnerRepo && trimmedOwnerRepo.includes('/')) {
        const [owner, repo] = trimmedOwnerRepo.split('/');
        body.testOwner = owner;
        body.testRepo = repo;
      }
      const response = await axios.post<TokenTestResult>(`${API_URL}/github/admin/test-token`, body);
      setTokenTestResult(response.data);
    } catch (error) {
      console.error('Error testing GitHub token:', error);
      setTokenTestResult({ hasToken: false, valid: false, error: 'Request failed' });
    } finally {
      setTestingToken(false);
    }
  }, [testUserId, testOwnerRepo]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return t('admin.githubDebug.never');
    return new Date(dateStr).toLocaleString();
  };

  return {
    debugInfo,
    loading,
    lastUpdated,
    testUserId,
    setTestUserId,
    testOwnerRepo,
    setTestOwnerRepo,
    tokenTestResult,
    testingToken,
    handleTestToken,
    fetchDebugInfo,
    formatDate,
  };
};
