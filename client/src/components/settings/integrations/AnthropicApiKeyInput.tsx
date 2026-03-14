import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface AnthropicApiKeyInputProps {
  anthropicApiKey: string;
  showApiKey: boolean;
  onAnthropicApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
}

export const AnthropicApiKeyInput: React.FC<AnthropicApiKeyInputProps> = ({
  anthropicApiKey,
  showApiKey,
  onAnthropicApiKeyChange,
  onShowApiKeyChange,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      <input
        type={showApiKey ? 'text' : 'password'}
        value={anthropicApiKey}
        onChange={event => onAnthropicApiKeyChange(event.target.value)}
        placeholder="sk-ant-..."
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          fontFamily: 'monospace',
        }}
      />
      <button
        onClick={() => onShowApiKeyChange(!showApiKey)}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.background.default,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {showApiKey ? t('settings.hide') : t('settings.show')}
      </button>
    </div>
  );
};
