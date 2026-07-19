import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';

interface ResponsiveBreakpoints {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export const getFeatureCardStyles = (breakpoints: ResponsiveBreakpoints, marginBottom?: string) => {
  const cardMarginBottom =
    marginBottom ||
    getResponsiveSpacing(breakpoints, {
      mobile: theme.spacing.md,
      tablet: theme.spacing.xl,
      desktop: theme.spacing.xl,
    });

  const cardPadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.sm,
    tablet: theme.spacing.md,
    desktop: theme.spacing.xl,
  });

  const headingFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.lg,
    desktop: theme.typography.fontSize['2xl'],
  });

  const emojiFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.xl,
    tablet: theme.typography.fontSize['2xl'],
    desktop: theme.typography.fontSize['3xl'],
  });

  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xs,
    tablet: theme.spacing.md,
    desktop: theme.spacing.md,
  });

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.base,
  });

  return {
    cardMarginBottom,
    cardPadding,
    headingFontSize,
    emojiFontSize,
    headingMarginBottom,
    bodyFontSize,
  };
};

export const getParagraphMarginBottom = (
  breakpoints: ResponsiveBreakpoints,
  index: number,
  totalDescriptions: number
): string => {
  if (index >= totalDescriptions - 1) {
    return '0';
  }
  return getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xs,
    tablet: theme.spacing.md,
    desktop: theme.spacing.md,
  });
};
