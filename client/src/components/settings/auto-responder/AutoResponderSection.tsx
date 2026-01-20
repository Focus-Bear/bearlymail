import React from 'react';
import { theme } from 'theme/theme';
import { AutoResponderHeader } from './AutoResponderHeader';
import { AutoResponderToggle } from './AutoResponderToggle';
import { AutoResponderPrioritySettings } from './AutoResponderPrioritySettings';
import { AutoResponderExclusionSettings } from './AutoResponderExclusionSettings';
import { AutoResponderQASettings } from './AutoResponderQASettings';
import { AutoResponderPreview } from './AutoResponderPreview';
import { AutoResponderConfig, QueueStats } from './types';

interface AutoResponderSectionProps {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  onConfigChange: (config: Partial<AutoResponderConfig>) => Promise<void>;
  loading?: boolean;
}

export const AutoResponderSection: React.FC<AutoResponderSectionProps> = ({
  config,
  queueStats,
  onConfigChange,
  loading = false,
}) => {
  const handleToggle = async (enabled: boolean) => {
    await onConfigChange({ enabled });
  };

  const handlePriorityChange = async (priority: keyof AutoResponderConfig['sendFor'], value: boolean) => {
    await onConfigChange({
      sendFor: {
        ...config.sendFor,
        [priority]: value,
      },
    });
  };

  const handleExclusionChange = async (exclusion: 'excludeAutomated' | 'excludeNewsletters' | 'excludeColdOutreach', value: boolean) => {
    await onConfigChange({ [exclusion]: value });
  };

  const handleQASettingsChange = async (settings: { qaContextEnabled?: boolean; qaMinConfidence?: number }) => {
    await onConfigChange(settings);
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
        opacity: loading ? 0.7 : 1,
        pointerEvents: loading ? 'none' : 'auto',
      }}
    >
      <AutoResponderHeader />

      <AutoResponderToggle
        enabled={config.enabled}
        onToggle={handleToggle}
      />

      {config.enabled && (
        <>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: theme.spacing.lg,
            marginTop: theme.spacing.lg,
          }}>
            <AutoResponderPrioritySettings
              sendFor={config.sendFor}
              onChange={handlePriorityChange}
            />

            <AutoResponderExclusionSettings
              excludeAutomated={config.excludeAutomated}
              excludeNewsletters={config.excludeNewsletters}
              excludeColdOutreach={config.excludeColdOutreach}
              onChange={handleExclusionChange}
            />
          </div>

          <AutoResponderQASettings
            qaContextEnabled={config.qaContextEnabled}
            qaMinConfidence={config.qaMinConfidence}
            onChange={handleQASettingsChange}
          />

          <AutoResponderPreview queueStats={queueStats} />
        </>
      )}
    </div>
  );
};
