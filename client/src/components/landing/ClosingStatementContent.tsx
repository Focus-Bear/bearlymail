import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import { getResponsiveFontSize, getResponsiveSpacing } from './utils';

/**
 * Content paragraphs for closing statement
 */
export const ClosingStatementContent: React.FC = () => {
  const breakpoints = useResponsiveBreakpoints();

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.xl,
  });

  const italicFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const paragraphMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const italicMarginTop = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          marginBottom: paragraphMarginBottom,
          maxWidth: '100%',
        }}
      >
        Three focused moments instead of 47 interruptions.
      </p>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          marginBottom: paragraphMarginBottom,
          maxWidth: '100%',
        }}
      >
        The emails that matter, when you're ready for them.
      </p>
      <p
        style={{
          fontSize: italicFontSize,
          color: theme.colors.primary.main,
          fontWeight: theme.typography.fontWeight.medium,
          marginTop: italicMarginTop,
          fontStyle: 'italic',
        }}
      >
        Built by someone who needed it to exist.
      </p>
    </>
  );
};



