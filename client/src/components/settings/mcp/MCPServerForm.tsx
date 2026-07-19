import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MCP_AUTH_TYPES, MCPServerPurpose } from 'components/settings/workflows/types';

import { MCPProviderPreset } from './mcpPresets';

interface MCPServerFormProps {
  preset: MCPProviderPreset;
  onConnect: (name: string, serverUrl: string, apiKey: string | undefined, purpose: MCPServerPurpose) => Promise<void>;
  /** Create the connection and redirect to the provider's OAuth consent screen. */
  onStartOAuth: (name: string, serverUrl: string, purpose: MCPServerPurpose) => Promise<void>;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.default}`,
  fontSize: 13,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: 'block',
  marginBottom: 2,
  color: theme.colors.text.primary,
};

/**
 * Connect form for a single MCP server, pre-filled from the chosen provider
 * preset. All fields stay editable — the preset only seeds sensible defaults.
 */
export const MCPServerForm: React.FC<MCPServerFormProps> = ({ preset, onConnect, onStartOAuth, onCancel }) => {
  const { t } = useTranslation();
  const isOAuth = preset.authType === MCP_AUTH_TYPES.OAUTH;
  // Providers with a known hosted endpoint are pre-filled and the URL field is
  // hidden, so connecting is a single click (no URL to find or paste).
  const hasFixedUrl = Boolean(preset.defaultServerUrl);
  const [name, setName] = useState(preset.name);
  const [serverUrl, setServerUrl] = useState(preset.defaultServerUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [purpose, setPurpose] = useState<MCPServerPurpose>(preset.purpose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!name.trim() || !serverUrl.trim()) {
      setError(t('settings.mcp.form.errorRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isOAuth) {
        // Resolves into a full-page redirect to the provider's consent screen.
        await onStartOAuth(name.trim(), serverUrl.trim(), purpose);
      } else {
        await onConnect(name.trim(), serverUrl.trim(), apiKey.trim() || undefined, purpose);
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    void handleConnect();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: theme.spacing.md,
        background: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: theme.borderRadius.sm,
            background: preset.isCustom ? theme.colors.background.paper : preset.brandColor,
            color: preset.isCustom ? theme.colors.text.secondary : '#FFFFFF',
            border: preset.isCustom ? `1px dashed ${theme.colors.border.default}` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {preset.initial}
        </span>
        <h5 style={{ ...theme.typography.heading.h6, margin: 0 }}>
          {preset.isCustom
            ? t('settings.mcp.form.connectCustom')
            : t('settings.mcp.form.connectNamed', { name: preset.name })}
        </h5>
      </div>

      <p
        style={{ fontSize: 12, color: theme.colors.text.secondary, margin: `0 0 ${theme.spacing.sm} 0`, lineHeight: 1.5 }}
      >
        {preset.instructions}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={labelStyle}>{t('settings.mcp.form.name')}</label>
          <input
            type="text"
            value={name}
            onChange={evt => setName(evt.target.value)}
            placeholder="My connection"
            style={inputStyle}
          />
        </div>
        {!hasFixedUrl && (
          <div>
            <label style={labelStyle}>{t('settings.mcp.form.serverUrl')}</label>
            <input
              type="url"
              value={serverUrl}
              onChange={evt => setServerUrl(evt.target.value)}
              placeholder={preset.urlPlaceholder}
              style={inputStyle}
            />
          </div>
        )}
        {isOAuth ? (
          <div
            style={{
              padding: '8px 10px',
              background: theme.colors.primary.subtle,
              borderRadius: theme.borderRadius.sm,
              color: theme.colors.text.secondary,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {t('settings.mcp.form.oauthNote')}
          </div>
        ) : (
          <div>
            <label style={labelStyle}>{t('settings.mcp.form.apiKey')}</label>
            <input
              type="password"
              value={apiKey}
              onChange={evt => setApiKey(evt.target.value)}
              placeholder="Bearer token or API key"
              style={inputStyle}
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>{t('settings.mcp.form.purpose')}</label>
          <select value={purpose} onChange={evt => setPurpose(evt.target.value as MCPServerPurpose)} style={inputStyle}>
            <option value="workflow">{t('settings.mcp.form.purposeWorkflow')}</option>
            <option value="sender_context">{t('settings.mcp.form.purposeSenderContext')}</option>
            <option value="ask_ai">{t('settings.mcp.form.purposeAskAi')}</option>
          </select>
        </div>

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

        <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: 2 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: theme.borderRadius.sm,
              border: 'none',
              background: theme.colors.primary.main,
              color: theme.colors.background.paper,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t('settings.mcp.connecting') : t('settings.mcp.connect')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.default}`,
              background: theme.colors.background.paper,
              color: theme.colors.text.primary,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </form>
  );
};
