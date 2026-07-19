import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MCPServerConfig, MCPServerPurpose } from 'components/settings/workflows/types';

import { MCPProviderPreset } from './mcpPresets';
import { MCPProviderGrid } from './MCPProviderGrid';
import { MCPServerCard } from './MCPServerCard';
import { MCPServerForm } from './MCPServerForm';

interface MCPServerManagerProps {
  servers: MCPServerConfig[];
  onAdd: (name: string, serverUrl: string, apiKey: string | undefined, purpose: MCPServerPurpose) => Promise<void>;
  onStartOAuth: (name: string, serverUrl: string, purpose: MCPServerPurpose) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRefresh: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ ok: boolean; toolCount: number }>;
}

/**
 * Manage MCP server connections: a quick-connect provider picker, a connect
 * form, and the list of currently-connected servers.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
export const MCPServerManager: React.FC<MCPServerManagerProps> = ({
  servers,
  onAdd,
  onStartOAuth,
  onRemove,
  onRefresh,
  onTest,
}) => {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<MCPProviderPreset | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; toolCount: number }>>({});
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (
    name: string,
    serverUrl: string,
    apiKey: string | undefined,
    purpose: MCPServerPurpose
  ) => {
    await onAdd(name, serverUrl, apiKey, purpose);
    setSelectedPreset(null);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setError(null);
    try {
      const result = await onTest(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setError(t('settings.mcp.manager.testFailed', { message: (err as Error).message }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {servers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map(server => (
            <MCPServerCard
              key={server.id}
              server={server}
              testResult={testResults[server.id]}
              testing={testing === server.id}
              onTest={handleTest}
              onRefresh={onRefresh}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '6px 10px',
            background: theme.colors.error.light,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.error.dark,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {selectedPreset ? (
        <MCPServerForm
          preset={selectedPreset}
          onConnect={handleConnect}
          onStartOAuth={onStartOAuth}
          onCancel={() => setSelectedPreset(null)}
        />
      ) : (
        <div>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}
          >
            {servers.length > 0 ? t('settings.mcp.manager.connectAnother') : t('settings.mcp.manager.connectFirst')}
          </div>
          <MCPProviderGrid onSelect={setSelectedPreset} />
        </div>
      )}
    </div>
  );
};
