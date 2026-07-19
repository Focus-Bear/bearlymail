import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

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
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.OPENAI_API_KEY_SAVED);
          onSaveApiKey();
        }}
        disabled={!openAiApiKey.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: openAiApiKey.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: openAiApiKey.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {apiKeySaved ? t('settings.saved') : t('settings.saveApiKey')}
      </button>
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.OPENAI_API_KEY_REMOVED);
          onRemoveApiKey();
        }}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.accent.error,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
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
