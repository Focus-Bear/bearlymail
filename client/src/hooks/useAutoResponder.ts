import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import {
  AutoResponderAnalytics,
  AutoResponderConfig,
  DEFAULT_AUTO_RESPONDER_CONFIG,
  QueueStats,
} from 'components/settings/auto-responder/types';
import { API_URL } from 'config/api';

interface UseAutoResponderReturn {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  analytics: AutoResponderAnalytics | null;
  loading: boolean;
  error: string | null;
  updateConfig: (config: Partial<AutoResponderConfig>) => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshAnalytics: (dateRange?: { start: Date; end: Date }) => Promise<void>;
  previewTemplate: (
    templateType: 'standard' | 'highPriority' | 'lowPriority' | 'zeroBacklog'
  ) => Promise<{ subject: string; body: string } | null>;
}

export const useAutoResponder = (): UseAutoResponderReturn => {
  const [config, setConfig] = useState<AutoResponderConfig>(DEFAULT_AUTO_RESPONDER_CONFIG);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [analytics, setAnalytics] = useState<AutoResponderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/auto-responder/settings`);
      setConfig(response.data.config);
    } catch (err) {
      console.error('Failed to fetch auto-responder config:', err);
      setError('Failed to load auto-responder settings');
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/auto-responder/stats`);
      setQueueStats(response.data.stats);
    } catch (err) {
      console.error('Failed to fetch queue stats:', err);
    }
  }, []);

  const fetchAnalytics = useCallback(async (dateRange?: { start: Date; end: Date }) => {
    try {
      const params = dateRange
        ? new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
          }).toString()
        : '';
      const response = await axios.get(`${API_URL}/auto-responder/analytics${params ? `?${params}` : ''}`);
      setAnalytics(response.data.analytics);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchConfig, fetchStats]);

  const updateConfig = useCallback(async (updates: Partial<AutoResponderConfig>) => {
    try {
      setError(null);
      const response = await axios.put(`${API_URL}/auto-responder/settings`, updates);
      setConfig(response.data.config);
    } catch (err) {
      console.error('Failed to update auto-responder config:', err);
      setError('Failed to save settings');
      throw err;
    }
  }, []);

  const refreshStats = useCallback(async () => {
    await fetchStats();
  }, [fetchStats]);

  const refreshAnalytics = useCallback(
    async (dateRange?: { start: Date; end: Date }) => {
      await fetchAnalytics(dateRange);
    },
    [fetchAnalytics]
  );

  const previewTemplate = useCallback(
    async (
      templateType: 'standard' | 'highPriority' | 'lowPriority' | 'zeroBacklog'
    ): Promise<{ subject: string; body: string } | null> => {
      try {
        const response = await axios.post(`${API_URL}/auto-responder/preview`, { templateType });
        return response.data.preview;
      } catch (err) {
        console.error('Failed to preview template:', err);
        return null;
      }
    },
    []
  );

  return {
    config,
    queueStats,
    analytics,
    loading,
    error,
    updateConfig,
    refreshStats,
    refreshAnalytics,
    previewTemplate,
  };
};
