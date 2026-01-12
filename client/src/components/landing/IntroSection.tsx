import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import {
  getSectionMarginBottom,
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
} from 'components/landing/utils';

/**
 * Introduction section component
 * Explains the origin story of BearlyMail
 */
export const IntroSection: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });
  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
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
        {t('landing.intro.heading')}
      </h2>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%',
        }}
      >
        {t('landing.intro.description')}
      </p>
    </section>
  );
};

