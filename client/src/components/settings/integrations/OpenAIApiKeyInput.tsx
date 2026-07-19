import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface OpenAIApiKeyInputProps {
  openAiApiKey: string;
  showApiKey: boolean;
  onOpenAiApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
}

export const OpenAIApiKeyInput: React.FC<OpenAIApiKeyInputProps> = ({
  openAiApiKey,
  showApiKey,
  onOpenAiApiKeyChange,
  onShowApiKeyChange,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      <input
        type={showApiKey ? 'text' : 'password'}
        value={openAiApiKey}
        onChange={event => onOpenAiApiKeyChange(event.target.value)}
        placeholder="sk-..."
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
