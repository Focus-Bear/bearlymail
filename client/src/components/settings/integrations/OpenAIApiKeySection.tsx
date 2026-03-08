import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OpenAIApiKeyActions } from 'components/settings/integrations/OpenAIApiKeyActions';
import { OpenAIApiKeyInput } from 'components/settings/integrations/OpenAIApiKeyInput';
import { INPUT_WIDTH_PX } from 'constants/numbers';

interface OpenAIApiKeySectionProps {
  openAiApiKey: string;
  showApiKey: boolean;
  apiKeySaved: boolean;
  onOpenAiApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
}

export const OpenAIApiKeySection: React.FC<OpenAIApiKeySectionProps> = ({
  openAiApiKey,
  showApiKey,
  apiKeySaved,
  onOpenAiApiKeyChange,
  onShowApiKeyChange,
  onSaveApiKey,
  onRemoveApiKey,
}) => {
  const { t } = useTranslation();

  return (
    <div
      id="api-key"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <h2
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.xl,
          scrollMarginTop: `${INPUT_WIDTH_PX}px`,
        }}
      >
        {t('settings.openAiTitle')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.openAiDesc')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <OpenAIApiKeyInput
          openAiApiKey={openAiApiKey}
          showApiKey={showApiKey}
          onOpenAiApiKeyChange={onOpenAiApiKeyChange}
          onShowApiKeyChange={onShowApiKeyChange}
        />
        <OpenAIApiKeyActions
          openAiApiKey={openAiApiKey}
          apiKeySaved={apiKeySaved}
          onSaveApiKey={onSaveApiKey}
          onRemoveApiKey={onRemoveApiKey}
        />
      </div>
    </div>
  );
};
