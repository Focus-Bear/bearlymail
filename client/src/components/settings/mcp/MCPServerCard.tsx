import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MCPServerConfig } from 'components/settings/workflows/types';

import { getPurposeMeta } from './mcpPresets';

interface MCPServerCardProps {
  server: MCPServerConfig;
  testResult?: { ok: boolean; toolCount: number };
  testing: boolean;
  onTest: (id: string) => void;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.default}`,
  background: theme.colors.background.paper,
  cursor: 'pointer',
  fontSize: 12,
};

/** A single connected MCP server with its purpose badge, status and actions. */
export const MCPServerCard: React.FC<MCPServerCardProps> = ({
  server,
  testResult,
  testing,
  onTest,
  onRefresh,
  onRemove,
}) => {
  const { t } = useTranslation();
  const purposeMeta = getPurposeMeta(t);
  const purpose = purposeMeta[server.purpose] ?? purposeMeta.workflow;

  return (
    <div
      style={{
        padding: theme.spacing.md,
        background: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {server.name}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 8px',
              borderRadius: theme.borderRadius.full,
              background: purpose.background,
              color: purpose.color,
            }}
          >
            {purpose.label}
          </span>
        </div>
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: 12,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {server.serverUrl}
        </div>
        <div style={{ fontSize: 12, marginTop: 4, color: theme.colors.text.secondary }}>
          {server.cachedTools
            ? t('settings.mcp.card.toolsDiscovered', { count: server.cachedTools.length })
            : t('settings.mcp.card.toolsNotFetched')}
          {testResult && (
            <span
              style={{
                marginLeft: 8,
                fontWeight: 600,
                color: testResult.ok ? theme.colors.success.main : theme.colors.error.main,
              }}
            >
              {testResult.ok
                ? t('settings.mcp.card.connected', { count: testResult.toolCount })
                : t('settings.mcp.card.connectionFailed')}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={() => onTest(server.id)} disabled={testing} style={secondaryButtonStyle}>
          {testing ? t('settings.mcp.card.testing') : t('settings.mcp.card.test')}
        </button>
        <button type="button" onClick={() => onRefresh(server.id)} style={secondaryButtonStyle}>
          {t('settings.mcp.card.refreshTools')}
        </button>
        <button
          type="button"
          onClick={() => onRemove(server.id)}
          style={{
            ...secondaryButtonStyle,
            border: `1px solid ${theme.colors.error.main}`,
            color: theme.colors.error.main,
          }}
        >
          {t('common.remove')}
        </button>
      </div>
    </div>
  );
};
