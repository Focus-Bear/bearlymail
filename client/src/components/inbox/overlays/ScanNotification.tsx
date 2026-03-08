import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ScanProgress {
  current: number;
  total: number;
}

interface ScanNotificationProps {
  progress: ScanProgress | null;
}

/**
 * Scan progress notification component
 */
export const ScanNotification: React.FC<ScanNotificationProps> = ({ progress }) => {
  const { t } = useTranslation();

  const getProgressPercentage = (): number => {
    if (!progress || progress.total === 0) {
      return 0;
    }
    return (progress.current / progress.total) * 100;
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        minWidth: '280px',
        zIndex: 1000,
        border: `2px solid ${theme.colors.primary.main}`,
      }}
    >
      {progress && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
            }}
          >
            <div
              className="animate-spin"
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid',
                borderColor: `${theme.colors.primary.main} transparent`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{t('onboarding.scan.analyzing')}</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.full,
              overflow: 'hidden',
              marginBottom: theme.spacing.sm,
            }}
          >
            <div
              style={{
                width: `${getProgressPercentage()}%`,
                height: '100%',
                backgroundColor: theme.colors.primary.main,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              textAlign: 'center',
              margin: 0,
            }}
          >
            {t('onboarding.scan.progress', {
              current: progress.current,
              total: progress.total,
            })}
          </p>
        </>
      )}
    </div>
  );
};
