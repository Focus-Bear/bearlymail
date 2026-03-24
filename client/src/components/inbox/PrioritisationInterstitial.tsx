import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface PrioritisationInterstitialProps {
  prioritised: number;
  total: number;
}

/**
 * Full-page interstitial shown while emails are being prioritised for the first time.
 * Replaces the inbox list until at least 20 emails have been prioritised.
 */
export const PrioritisationInterstitial: React.FC<PrioritisationInterstitialProps> = ({
  prioritised,
  total,
}) => {
  const { t } = useTranslation();
  // Guard against division-by-zero when total is 0 (analysis not yet started)
  const pct = total > 0 ? Math.round((prioritised / total) * 100) : 0;
  const progressPercent = Math.min(100, pct);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: theme.spacing['3xl'],
        backgroundColor: theme.colors.background.default,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.xl,
          border: `1px solid ${theme.colors.border.light}`,
          padding: theme.spacing['3xl'],
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>📊</div>
        <h2
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
            fontSize: theme.typography.fontSize.xl,
          }}
        >
          {t('inbox.prioritisationGate.title')}
        </h2>
        <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xl }}>
          {t('inbox.prioritisationGate.subtitle')}
        </p>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-live="polite"
          style={{
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.full ?? '9999px',
            height: '12px',
            marginBottom: theme.spacing.sm,
            overflow: 'hidden',
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              backgroundColor: theme.colors.primary.main,
              borderRadius: theme.borderRadius.full ?? '9999px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>

        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.lg,
          }}
        >
          {t('inbox.prioritisationGate.progress', { count: prioritised, total })}
        </p>

        <p
          style={{
            color: theme.colors.text.tertiary ?? theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.xs,
            fontStyle: 'italic',
          }}
        >
          {t('inbox.prioritisationGate.patience')}
        </p>
      </div>
    </div>
  );
};
