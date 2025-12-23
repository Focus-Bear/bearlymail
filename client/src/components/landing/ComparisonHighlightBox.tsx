import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import { getResponsiveFontSize, getResponsiveSpacing } from './utils';

/**
 * Highlight box component for comparison section
 * Displays key differentiators in a highlighted box
 */
export const ComparisonHighlightBox: React.FC = () => {
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
      <p style={{ ...paragraphStyle, color: theme.colors.text.secondary }}>
        Gmail's Priority Inbox guesses based on generic signals.
      </p>
      <p style={{ ...paragraphStyle, color: theme.colors.text.secondary }}>
        Superhuman makes you faster at processing emails when they arrive.
      </p>
      <p
        style={{
          ...paragraphStyle,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
          marginBottom: 0,
        }}
      >
        BearlyMail learns from what you actually do—not what you tell it, not what Google thinks is important.
      </p>
      <p
        style={{
          ...paragraphStyle,
          color: theme.colors.text.secondary,
          marginTop: paragraphMargin,
        }}
      >
        We watch how fast you reply, which emails you read vs archive, who you always open. Then we get out of your
        way.
      </p>
    </div>
  );
};



