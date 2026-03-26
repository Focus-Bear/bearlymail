import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { MCPServerConfig } from './types';

interface MCPServerManagerProps {
  servers: MCPServerConfig[];
  onAdd: (name: string, serverUrl: string, apiKey?: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRefresh: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ ok: boolean; toolCount: number }>;
}

/**
 * Manage MCP server connections in the integrations settings section.
 * Part of feature #1483 — Automated Email Workflows.
 */
export const MCPServerManager: React.FC<MCPServerManagerProps> = ({
  servers,
  onAdd,
  onRemove,
  onRefresh,
  onTest,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; toolCount: number }>>({});
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!name.trim() || !serverUrl.trim()) {
      setError('Name and Server URL are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(name.trim(), serverUrl.trim(), apiKey.trim() || undefined);
      setName('');
      setServerUrl('');
      setApiKey('');
      setShowForm(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setError(null);
    try {
      const result = await onTest(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setError(`Test failed: ${(err as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${theme.colors.border.default}`,
    fontSize: 13,
    boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <h4 style={{ ...theme.typography.heading.h4, margin: 0 }}>MCP Servers</h4>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${theme.colors.primary.main}`,
            background: showForm ? theme.colors.background.paper : theme.colors.primary.main,
            color: showForm ? theme.colors.primary.main : theme.colors.background.paper,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {showForm ? 'Cancel' : '+ Add MCP Server'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: theme.spacing.md, background: theme.colors.background.subtle, borderRadius: theme.borderRadius.md, marginBottom: theme.spacing.md }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 2 }}>Name</label>
              <input type="text" value={name} onChange={(evt) => setName(evt.target.value)} placeholder="Focus Bear" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 2 }}>Server URL</label>
              <input type="url" value={serverUrl} onChange={(evt) => setServerUrl(evt.target.value)} placeholder="https://api.focusbear.io/mcp" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 2 }}>API Key (optional)</label>
              <input type="password" value={apiKey} onChange={(evt) => setApiKey(evt.target.value)} placeholder="Bearer token or API key" style={inputStyle} />
            </div>
            {error && (
              <div style={{ padding: '6px 10px', background: theme.colors.error.light, borderRadius: 6, color: theme.colors.error.dark, fontSize: 12 }}>
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              style={{
                alignSelf: 'flex-start',
                padding: '6px 16px',
                borderRadius: 6,
                border: 'none',
                background: theme.colors.primary.main,
                color: theme.colors.background.paper,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <p style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
          No MCP servers connected. Add one above to enable MCP tool actions in your workflows.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map((server) => {
            const testResult = testResults[server.id];
            return (
              <div
                key={server.id}
                style={{
                  padding: theme.spacing.md,
                  background: theme.colors.background.subtle,
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${theme.colors.border.default}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{server.name}</div>
                  <div style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                    {server.serverUrl}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: theme.colors.text.secondary }}>
                    {server.cachedTools
                      ? `${server.cachedTools.length} tools discovered`
                      : 'Tools not yet fetched'}
                    {testResult && (
                      <span style={{ marginLeft: 8, color: testResult.ok ? theme.colors.success.main : theme.colors.error.main }}>
                        {testResult.ok ? `✓ Connected (${testResult.toolCount} tools)` : '✗ Connection failed'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleTest(server.id)}
                    disabled={testing === server.id}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.colors.border.default}`, background: theme.colors.background.paper, cursor: 'pointer', fontSize: 12 }}
                  >
                    {testing === server.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRefresh(server.id)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.colors.border.default}`, background: theme.colors.background.paper, cursor: 'pointer', fontSize: 12 }}
                  >
                    Refresh Tools
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(server.id)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.colors.error.main}`, color: theme.colors.error.main, background: theme.colors.background.paper, cursor: 'pointer', fontSize: 12 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
