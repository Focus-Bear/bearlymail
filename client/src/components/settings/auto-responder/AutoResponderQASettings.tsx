import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface AutoResponderQASettingsProps {
  qaContextEnabled: boolean;
  qaMinConfidence: number;
  onChange: (settings: { qaContextEnabled?: boolean; qaMinConfidence?: number }) => void;
}

interface QAConfidenceSettingsProps {
  qaMinConfidence: number;
  onChange: (settings: { qaMinConfidence?: number }) => void;
  t: (key: string) => string;
}

const QAConfidenceSettings: React.FC<QAConfidenceSettingsProps> = ({ qaMinConfidence, onChange, t }) => (
  <div
    style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.sm,
      padding: theme.spacing.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm }}
    >
      <span style={{ ...theme.typography.body.large, color: theme.colors.text.primary }}>
        {t('settings.autoResponder.qa.confidenceThreshold')}
      </span>
      <span
        style={{
          ...theme.typography.body.large,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.primary.main,
        }}
      >
        {Math.round(qaMinConfidence * 100)}%
      </span>
    </div>

    <input
      type="range"
      min="0"
      max="100"
      value={qaMinConfidence * 100}
      onChange={event => onChange({ qaMinConfidence: parseInt(event.target.value, 10) / 100 })}
      style={{ width: '100%', accentColor: theme.colors.primary.main, cursor: 'pointer' }}
    />

    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: theme.spacing.xs }}>
      <span style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary }}>
        {t('settings.autoResponder.qa.moreAnswers')}
      </span>
      <span style={{ ...theme.typography.body.small, color: theme.colors.text.tertiary }}>
        {t('settings.autoResponder.qa.fewerAnswers')}
      </span>
    </div>

    <p
      style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.tertiary,
        marginTop: theme.spacing.md,
        marginBottom: 0,
      }}
    >
      {t('settings.autoResponder.qa.confidenceNote')}
    </p>
  </div>
);

export const AutoResponderQASettings: React.FC<AutoResponderQASettingsProps> = ({
  qaContextEnabled,
  qaMinConfidence,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
      }}
    >
      <h3
        style={{
          ...theme.typography.heading.h6,
          color: theme.colors.text.primary,
          marginTop: 0,
          marginBottom: theme.spacing.sm,
        }}
      >
        🧠 {t('settings.autoResponder.qa.title')}
      </h3>

      <p
        style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('settings.autoResponder.qa.description')}
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          cursor: 'pointer',
          marginBottom: theme.spacing.md,
        }}
      >
        <input
          type="checkbox"
          checked={qaContextEnabled}
          onChange={event => onChange({ qaContextEnabled: event.target.checked })}
          style={{ width: '18px', height: '18px', accentColor: theme.colors.primary.main, cursor: 'pointer' }}
        />
        <span
          style={{
            ...theme.typography.body.xLarge,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
          }}
        >
          {t('settings.autoResponder.qa.includeAiAnswers')}
        </span>
      </label>

      {qaContextEnabled && <QAConfidenceSettings qaMinConfidence={qaMinConfidence} onChange={onChange} t={t} />}
    </div>
  );
};
