import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { GATE_THRESHOLD } from 'hooks/usePrioritisationGate';

interface PrioritisationInterstitialProps {
  /** Number of threads that have been prioritised so far */
  prioritisedCount: number;
  /** Total threads in the inbox (used to set max for progress bar) */
  totalCount: number;
  /** Called when the user wants to skip the gate and see their inbox early */
  onDismiss: () => void;
}

/**
 * Shown to new users while their emails are being prioritised.
 * Gates the inbox until GATE_THRESHOLD emails have been analysed.
 *
 * Part of: fix #1433 — new user onboarding gate
 */
export const PrioritisationInterstitial: React.FC<PrioritisationInterstitialProps> = ({
  prioritisedCount,
  totalCount,
  onDismiss,
}) => {
  const { t } = useTranslation();

  const target = totalCount < GATE_THRESHOLD ? totalCount : GATE_THRESHOLD;
  const progressPercent = target > 0 ? Math.min(Math.round((prioritisedCount / target) * 100), 100) : 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing['3xl'],
        backgroundColor: theme.colors.background.default,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          padding: theme.spacing['2xl'],
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.xl,
          border: `1px solid ${theme.colors.border.default}`,
          boxShadow: theme.shadows.md,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: '2.5rem', marginBottom: theme.spacing.md }}>📊</div>

        {/* Title */}
        <h2
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('inbox.prioritisationGate.title')}
        </h2>

        {/* Subtitle */}
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.base,
            marginBottom: theme.spacing.xl,
            lineHeight: theme.typography.lineHeight.relaxed,
          }}
        >
          {t('inbox.prioritisationGate.subtitle')}
        </p>

        {/* Progress bar */}
        <div style={{ marginBottom: theme.spacing.sm }}>
          <div
            aria-label={t('inbox.prioritisationGate.progress', { count: prioritisedCount, total: target })}
            role="progressbar"
            aria-valuenow={prioritisedCount}
            aria-valuemin={0}
            aria-valuemax={target}
          >
            <div
              style={{
                height: 10,
                backgroundColor: theme.colors.border.default,
                borderRadius: theme.borderRadius.full,
                overflow: 'hidden',
                marginBottom: theme.spacing.xs,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: theme.colors.primary.main,
                  borderRadius: theme.borderRadius.full,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
          <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
            {t('inbox.prioritisationGate.progress', {
              count: prioritisedCount,
              total: target,
            })}
          </p>
        </div>

        {/* Patience message */}
        <p
          style={{
            color: theme.colors.text.tertiary ?? theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.xl,
          }}
        >
          {t('inbox.prioritisationGate.patience')}
        </p>

        {/* Skip link */}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: 0,
          }}
        >
          {t('inbox.prioritisationGate.skip')}
        </button>
      </div>
    </div>
  );
};
