import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { formatEtaMinutes } from 'hooks/settings/recategorizeEta';
import { RecategorizeProgressState } from 'hooks/settings/useRecategorizeProgress';

interface RecategorizeProgressBarProps {
  progress: RecategorizeProgressState;
  onDismiss: () => void;
}

const spinnerStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  border: `2px solid ${theme.colors.accent.warning}`,
  borderTop: '2px solid transparent',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  flexShrink: 0,
};

interface ProgressBarFillProps {
  percentage: number;
  isComplete: boolean;
}

const ProgressBarFill: React.FC<ProgressBarFillProps> = ({ percentage, isComplete }) => (
  <div
    style={{
      width: `${percentage}%`,
      height: '100%',
      backgroundColor: isComplete ? theme.colors.accent.success : theme.colors.accent.warning,
      transition: 'width 0.3s ease',
    }}
  />
);

export const RecategorizeProgressBar: React.FC<RecategorizeProgressBarProps> = ({ progress, onDismiss }) => {
  const { t } = useTranslation();

  if (!progress.isShowing) {
    return null;
  }

  const { total, completed, failed, pending, isComplete, etaMs } = progress;
  const processed = completed + failed;
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          {!isComplete && <div style={spinnerStyle} />}
          <span
            style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
            }}
          >
            {isComplete
              ? t('settings.emailCategories.recategorizeProgress.complete')
              : t('settings.emailCategories.recategorizeProgress.inProgress')}
          </span>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t('settings.emailCategories.recategorizeProgress.dismiss')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '18px',
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            padding: '0',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: theme.colors.border.light,
          borderRadius: theme.borderRadius.full,
          overflow: 'hidden',
          marginBottom: theme.spacing.xs,
        }}
      >
        <ProgressBarFill percentage={percentage} isComplete={isComplete} />
      </div>

      <p
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          margin: 0,
        }}
      >
        {failed > 0
          ? t('settings.emailCategories.recategorizeProgress.statusWithFailed', {
              processed,
              total,
              failed,
            })
          : t('settings.emailCategories.recategorizeProgress.status', {
              processed,
              total,
            })}
        {pending > 0 && !isComplete && (
          <span style={{ marginLeft: '4px' }}>
            {t('settings.emailCategories.recategorizeProgress.remaining', { pending })}
          </span>
        )}
        {etaMs !== null && !isComplete && (
          <span style={{ marginLeft: '4px' }}>
            {t('settings.emailCategories.recategorizeProgress.eta', { minutes: formatEtaMinutes(etaMs) })}
          </span>
        )}
      </p>
    </div>
  );
};
