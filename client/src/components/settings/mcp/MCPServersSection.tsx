import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { MCPServerConfig, MCPServerPurpose } from 'components/settings/workflows/types';
import { API_URL } from 'config/api';

import { MCPServerManager } from './MCPServerManager';

/**
 * Standalone settings card for connecting third-party apps over MCP. Kept
 * separate from the Workflows card so connections are managed in one place and
 * can power sender-context lookups and Ask AI as well as workflow actions.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
export const MCPServersSection: React.FC = () => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<MCPServerConfig[]>(`${API_URL}/mcp-servers`);
      setServers(res.data);
    } catch {
      setError(t('settings.mcp.section.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const handleAdd = async (
    name: string,
    serverUrl: string,
    apiKey: string | undefined,
    purpose: MCPServerPurpose
  ) => {
    await axios.post(`${API_URL}/mcp-servers`, { name, serverUrl, apiKey, purpose });
    await loadServers();
  };

  const handleRemove = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/mcp-servers/${id}`);
      await loadServers();
    } catch {
      setError(t('settings.mcp.section.removeError'));
    }
  };

  const handleRefresh = async (id: string) => {
    try {
      await axios.post(`${API_URL}/mcp-servers/${id}/refresh`);
      await loadServers();
    } catch {
      setError(t('settings.mcp.section.refreshError'));
    }
  };

  const handleTest = async (id: string) => {
    const res = await axios.post<{ ok: boolean; toolCount: number }>(`${API_URL}/mcp-servers/${id}/test`);
    return res.data;
  };

  return (
    <div
      id="connected-apps"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <div style={{ marginBottom: theme.spacing.lg }}>
        <h2 style={{ ...theme.typography.heading.h2, margin: 0 }}>{t('settings.mcp.section.title')}</h2>
        <p style={{ ...theme.typography.body.medium, color: theme.colors.text.secondary, marginTop: 4 }}>
          {t('settings.mcp.section.description')}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: theme.colors.error.light,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.error.dark,
            fontSize: 13,
            marginBottom: theme.spacing.md,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: theme.colors.text.secondary }}>{t('settings.mcp.section.loading')}</p>
      ) : (
        <MCPServerManager
          servers={servers}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onRefresh={handleRefresh}
          onTest={handleTest}
        />
      )}
    </div>
  );
};
