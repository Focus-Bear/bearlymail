import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ComparisonHighlightBox } from 'components/landing/ComparisonHighlightBox';
import { ComparisonTable } from 'components/landing/ComparisonTable';
import {
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
  getSectionMarginBottom,
} from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Comparison section component
 * Shows how BearlyMail differs from competitors
 */
export const ComparisonSection: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const comparisonRows = [
    {
      label: t('landing.comparison.table.rows.emailDelivery.label'),
      bearlyMail: t('landing.comparison.table.rows.emailDelivery.bearlyMail'),
      superhuman: t('landing.comparison.table.rows.emailDelivery.superhuman'),
      gmail: t('landing.comparison.table.rows.emailDelivery.gmail'),
    },
    {
      label: t('landing.comparison.table.rows.urgentFiltering.label'),
      bearlyMail: t('landing.comparison.table.rows.urgentFiltering.bearlyMail'),
      superhuman: t('landing.comparison.table.rows.urgentFiltering.superhuman'),
      gmail: t('landing.comparison.table.rows.urgentFiltering.gmail'),
    },
    {
      label: t('landing.comparison.table.rows.prioritization.label'),
      bearlyMail: t('landing.comparison.table.rows.prioritization.bearlyMail'),
      superhuman: t('landing.comparison.table.rows.prioritization.superhuman'),
      gmail: t('landing.comparison.table.rows.prioritization.gmail'),
    },
    {
      label: t('landing.comparison.table.rows.philosophy.label'),
      bearlyMail: t('landing.comparison.table.rows.philosophy.bearlyMail'),
      superhuman: t('landing.comparison.table.rows.philosophy.superhuman'),
      gmail: t('landing.comparison.table.rows.philosophy.gmail'),
    },
  ];

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const introFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const introMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <section
      style={{
        marginBottom: getSectionMarginBottom(breakpoints),
      }}
    >
      <h2
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
        }}
      >
        {t('landing.comparison.heading')}
      </h2>
      <p
        style={{
          fontSize: introFontSize,
          color: theme.colors.text.secondary,
          marginBottom: introMarginBottom,
          lineHeight: 1.8,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%',
          whiteSpace: 'normal',
        }}
      >
        <strong style={{ color: theme.colors.text.primary }}>{t('landing.comparison.superhumanAsks')}</strong>{' '}
        {t('landing.comparison.superhumanQuestion')}
        {breakpoints.isMobile ? (
          ' '
        ) : (
          <>
            <br />{' '}
          </>
        )}
        <strong style={{ color: theme.colors.primary.main }}>{t('landing.comparison.bearlyMailAsks')}</strong>{' '}
        {t('landing.comparison.bearlyMailQuestion')}
      </p>

      {!breakpoints.isMobile && <ComparisonTable rows={comparisonRows} />}

      <ComparisonHighlightBox />
    </section>
  );
};
