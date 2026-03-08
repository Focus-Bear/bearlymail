import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Header section for waitlist form
 */
export const WaitlistFormHeader: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const headingFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.lg,
    tablet: theme.typography.fontSize.xl,
    desktop: theme.typography.fontSize['2xl'],
  });

  const descriptionFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.base,
  });

  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.sm,
    tablet: theme.spacing.md,
    desktop: theme.spacing.md,
  });

  const descriptionMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <>
      <h3
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
          textAlign: 'center',
        }}
      >
        {t('landing.waitlist.heading')}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: descriptionMarginBottom,
          textAlign: 'center',
          fontSize: descriptionFontSize,
        }}
      >
        {t('landing.waitlist.description')}
      </p>
    </>
  );
};
