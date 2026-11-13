import React from 'react';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED_ALT } from 'constants/numbers';

import { AutoResponderDeliverySettings } from './AutoResponderDeliverySettings';
import { AutoResponderEmailPreview } from './AutoResponderEmailPreview';
import { AutoResponderExclusionSettings } from './AutoResponderExclusionSettings';
import { AutoResponderHeader } from './AutoResponderHeader';
import { AutoResponderQASettings } from './AutoResponderQASettings';
import { AutoResponderTemplateEditor } from './AutoResponderTemplateEditor';
import { AutoResponderToggle } from './AutoResponderToggle';
import { AUTO_RESPONDER_DELIVERY_MODES, AutoResponderConfig, QueueStats } from './types';

interface AutoResponderSectionProps {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  onConfigChange: (config: Partial<AutoResponderConfig>) => Promise<void>;
  loading?: boolean;
  userName?: string;
}

export const AutoResponderSection: React.FC<AutoResponderSectionProps> = ({
  config,
  queueStats,
  onConfigChange,
  loading = false,
  userName,
}) => {
  const handleToggle = async (enabled: boolean) => {
    await onConfigChange({ enabled });
  };

  const handleDeliveryModeChange = async (deliveryMode: AutoResponderConfig['deliveryMode']) => {
    await onConfigChange({ deliveryMode });
  };

  const handleExclusionRulesChange = async (customExclusionRules: string[]) => {
    await onConfigChange({ customExclusionRules });
  };

  const handleQASettingsChange = async (settings: { qaContextEnabled?: boolean; qaMinConfidence?: number }) => {
    await onConfigChange(settings);
  };

  const handleTemplateChange = async (templates: Partial<AutoResponderConfig['templates']>) => {
    await onConfigChange({ templates: { ...config.templates, ...templates } });
  };

  return (
    <div
      id="auto-responder"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
        opacity: loading ? OPACITY_DISABLED_ALT : 1,
        pointerEvents: loading ? 'none' : 'auto',
      }}
    >
      <AutoResponderHeader />

      <AutoResponderToggle enabled={config.enabled} onToggle={handleToggle} />

      {config.enabled && (
        <>
          <AutoResponderDeliverySettings
            deliveryMode={config.deliveryMode ?? AUTO_RESPONDER_DELIVERY_MODES.DRAFT}
            onChange={handleDeliveryModeChange}
          />

          <AutoResponderExclusionSettings
            customExclusionRules={config.customExclusionRules || []}
            onChange={handleExclusionRulesChange}
          />

          <AutoResponderQASettings
            qaContextEnabled={config.qaContextEnabled}
            qaMinConfidence={config.qaMinConfidence}
            onChange={handleQASettingsChange}
          />

          <AutoResponderTemplateEditor
            config={config}
            queueStats={queueStats}
            userName={userName}
            onTemplateChange={handleTemplateChange}
          />

          <AutoResponderEmailPreview />
        </>
      )}
    </div>
  );
};
