import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Highlight box component for comparison section
 * Displays key differentiators in a highlighted box
 */
export const ComparisonHighlightBox: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const padding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.sm,
    tablet: theme.spacing.md,
    desktop: theme.spacing.xl,
  });

  const marginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  const fontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.base,
  });

  const paragraphMargin = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xs,
    tablet: theme.spacing.md,
    desktop: theme.spacing.md,
  });

  const paragraphStyle: React.CSSProperties = {
    fontSize,
    lineHeight: 1.8,
    marginBottom: paragraphMargin,
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    maxWidth: '100%',
  };

  return (
    <div
      style={{
        padding,
        backgroundColor: theme.colors.primary.subtle,
        borderRadius: theme.borderRadius.lg,
        marginBottom,
      }}
    >
      <p style={{ ...paragraphStyle, color: theme.colors.text.secondary }}>{t('landing.comparison.highlight.gmail')}</p>
      <p style={{ ...paragraphStyle, color: theme.colors.text.secondary }}>
        {t('landing.comparison.highlight.superhuman')}
      </p>
      <p
        style={{
          ...paragraphStyle,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
          marginBottom: 0,
        }}
      >
        {t('landing.comparison.highlight.bearlyMail')}
      </p>
      <p
        style={{
          ...paragraphStyle,
          color: theme.colors.text.secondary,
          marginTop: paragraphMargin,
        }}
      >
        {t('landing.comparison.highlight.learning')}
      </p>
    </div>
  );
};
