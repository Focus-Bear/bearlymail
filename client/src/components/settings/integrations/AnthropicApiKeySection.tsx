import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AnthropicApiKeyActions } from 'components/settings/integrations/AnthropicApiKeyActions';
import { AnthropicApiKeyInput } from 'components/settings/integrations/AnthropicApiKeyInput';
import { INPUT_WIDTH_PX } from 'constants/numbers';

interface AnthropicApiKeySectionProps {
  anthropicApiKey: string;
  showAnthropicKey: boolean;
  anthropicApiKeySaved: boolean;
  hasAnthropicKey: boolean;
  onAnthropicApiKeyChange: (key: string) => void;
  onShowAnthropicKeyChange: (show: boolean) => void;
  onSaveAnthropicKey: () => Promise<void>;
  onRemoveAnthropicKey: () => Promise<void>;
}

export const AnthropicApiKeySection: React.FC<AnthropicApiKeySectionProps> = ({
  anthropicApiKey,
  showAnthropicKey,
  anthropicApiKeySaved,
  hasAnthropicKey,
  onAnthropicApiKeyChange,
  onShowAnthropicKeyChange,
  onSaveAnthropicKey,
  onRemoveAnthropicKey,
}) => {
  const { t } = useTranslation();

  return (
    <div
      id="anthropic-api-key"
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
        {t('settings.anthropicTitle')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.anthropicDesc')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <AnthropicApiKeyInput
          anthropicApiKey={anthropicApiKey}
          showApiKey={showAnthropicKey}
          onAnthropicApiKeyChange={onAnthropicApiKeyChange}
          onShowApiKeyChange={onShowAnthropicKeyChange}
        />
        <AnthropicApiKeyActions
          anthropicApiKey={anthropicApiKey}
          apiKeySaved={anthropicApiKeySaved}
          hasAnthropicKey={hasAnthropicKey}
          onSaveApiKey={onSaveAnthropicKey}
          onRemoveApiKey={onRemoveAnthropicKey}
        />
      </div>
    </div>
  );
};
