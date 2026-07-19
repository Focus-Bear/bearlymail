import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface AnthropicApiKeyActionsProps {
  anthropicApiKey: string;
  apiKeySaved: boolean;
  hasAnthropicKey: boolean;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
}

export const AnthropicApiKeyActions: React.FC<AnthropicApiKeyActionsProps> = ({
  anthropicApiKey,
  apiKeySaved,
  hasAnthropicKey,
  onSaveApiKey,
  onRemoveApiKey,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.ANTHROPIC_API_KEY_SAVED);
          onSaveApiKey();
        }}
        disabled={!anthropicApiKey.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: anthropicApiKey.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: anthropicApiKey.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {apiKeySaved ? t('settings.saved') : t('settings.saveApiKey')}
      </button>

      {hasAnthropicKey && (
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.ANTHROPIC_API_KEY_REMOVED);
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
      )}

      <a
        href="https://console.anthropic.com/settings/keys"
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

      <span
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: hasAnthropicKey ? theme.colors.accent.success : theme.colors.text.tertiary,
        }}
      >
        {hasAnthropicKey ? t('settings.anthropicKeySaved') : t('settings.anthropicNoKey')}
      </span>
    </div>
  );
};
