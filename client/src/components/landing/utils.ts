import { theme } from '../../theme/theme';

/**
 * Utility functions for landing page components
 * Helps reduce nested ternary expressions and improve readability
 */

interface ResponsiveBreakpoints {
  isMobile: boolean;
  isTablet: boolean;
}

/**
 * Gets responsive font size based on breakpoints
 */
export const getResponsiveFontSize = (
  breakpoints: ResponsiveBreakpoints,
  sizes: {
    mobile: string;
    tablet: string;
    desktop: string;
  }
): string => {
  if (breakpoints.isMobile) return sizes.mobile;
  if (breakpoints.isTablet) return sizes.tablet;
  return sizes.desktop;
};

/**
 * Gets responsive spacing based on breakpoints
 */
export const getResponsiveSpacing = (
  breakpoints: ResponsiveBreakpoints,
  spacing: {
    mobile: string;
    tablet: string;
    desktop: string;
  }
): string => {
  if (breakpoints.isMobile) return spacing.mobile;
  if (breakpoints.isTablet) return spacing.tablet;
  return spacing.desktop;
};

/**
 * Gets responsive margin bottom for sections
 */
export const getSectionMarginBottom = (breakpoints: ResponsiveBreakpoints): string => {
  if (breakpoints.isMobile) return theme.spacing.lg;
  if (breakpoints.isTablet) return theme.spacing.xl;
  return theme.spacing['3xl'];
};

/**
 * Gets responsive padding top for hero section
 */
export const getHeroPaddingTop = (breakpoints: ResponsiveBreakpoints): string => {
  if (breakpoints.isMobile) return theme.spacing.lg;
  if (breakpoints.isTablet) return theme.spacing.xl;
  return theme.spacing['3xl'];
};

/**
 * Gets responsive heading font sizes
 */
export const getHeadingFontSize = (
  breakpoints: ResponsiveBreakpoints,
  level: 'h1' | 'h2' | 'h3'
): string => {
  if (breakpoints.isMobile) {
    switch (level) {
      case 'h1':
        return theme.typography.fontSize.xl;
      case 'h2':
        return theme.typography.fontSize.xl;
      case 'h3':
        return theme.typography.fontSize.base;
      default:
        return theme.typography.fontSize.base;
    }
  }
  if (breakpoints.isTablet) {
    switch (level) {
      case 'h1':
        return theme.typography.fontSize['2xl'];
      case 'h2':
        return theme.typography.fontSize['2xl'];
      case 'h3':
        return theme.typography.fontSize.lg;
      default:
        return theme.typography.fontSize.lg;
    }
  }
  switch (level) {
    case 'h1':
      return theme.typography.fontSize['4xl'];
    case 'h2':
      return theme.typography.fontSize['3xl'];
    case 'h3':
      return theme.typography.fontSize['2xl'];
    default:
      return theme.typography.fontSize['2xl'];
  }
};



