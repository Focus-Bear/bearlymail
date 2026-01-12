import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface OpenAIApiKeyActionsProps {
  openAiApiKey: string;
  apiKeySaved: boolean;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
}

export const OpenAIApiKeyActions: React.FC<OpenAIApiKeyActionsProps> = ({
  openAiApiKey,
  apiKeySaved,
  onSaveApiKey,
  onRemoveApiKey,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md }}>
      <button
        onClick={onSaveApiKey}
        disabled={!openAiApiKey.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: openAiApiKey.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
          color: 'white',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: openAiApiKey.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {apiKeySaved ? t('settings.saved') : t('settings.saveApiKey')}
      </button>
      <button
        onClick={onRemoveApiKey}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.accent.error,
          color: 'white',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
        }}
      >
        {t('settings.removeKey')}
      </button>
      <a
        href="https://platform.openai.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          color: theme.colors.primary.main,
          textDecoration: 'underline',
          fontSize: theme.typography.fontSize.sm,
          alignSelf: 'center',
        }}
      >
        {t('settings.getKey')}
      </a>
    </div>
  );
};





