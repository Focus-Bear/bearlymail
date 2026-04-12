/**
 * EnrichmentProgress
 *
 * Displays a progress bar while the background Gmail enrichment job is running
 * (i.e. while the backend is fetching full message bodies + AI scoring for
 * results returned by the instant search path).
 *
 * Shows "3/10 emails processed" with a smooth fill bar.
 * Hides automatically when enriched === total (all done).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export interface EnrichmentProgressProps {
  enriched: number;
  total: number;
  /** When true, renders an error state instead of a progress bar. */
  failed?: boolean;
}

export const EnrichmentProgress: React.FC<EnrichmentProgressProps> = ({ enriched, total, failed }) => {
  const { t } = useTranslation();

  // Show error state when enrichment polling failed
  if (failed) {
    return (
      <div
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          marginBottom: theme.spacing.md,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('search.enrichmentFailed')}
        </span>
      </div>
    );
  }

  if (total === 0 || enriched >= total) {
    return null;
  }

  const percent = Math.round((enriched / total) * 100);

  return (
    <div
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        marginBottom: theme.spacing.md,
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
          marginBottom: theme.spacing.xs,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('search.enrichmentLoading')}
        </span>
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t('search.enrichmentProgress', { enriched, total })}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: '4px',
          backgroundColor: theme.colors.border.light,
          borderRadius: theme.borderRadius.full,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: theme.colors.primary.main,
            borderRadius: theme.borderRadius.full,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
};
