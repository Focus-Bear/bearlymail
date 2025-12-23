import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import { getResponsiveFontSize, getResponsiveSpacing } from './utils';

interface FeatureCardProps {
  /**
   * Feature title
   */
  title: string;
  /**
   * Feature description paragraphs
   */
  description: string | string[];
  /**
   * Border color on the left side
   */
  borderColor: string;
  /**
   * Optional emoji/icon to display next to the title
   */
  emoji?: string;
  /**
   * Optional margin bottom override
   */
  marginBottom?: string;
  /**
   * Optional unique key for the card (used for React keys)
   */
  cardKey?: string;
}

/**
 * Reusable feature card component
 * Displays a feature with a colored left border
 */
export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  borderColor,
  emoji,
  marginBottom,
  cardKey,
}) => {
  const breakpoints = useResponsiveBreakpoints();
  const descriptions = Array.isArray(description) ? description : [description];

  const cardMarginBottom = marginBottom || getResponsiveSpacing(breakpoints, {
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

  const getParagraphMarginBottom = (index: number): string => {
    if (index >= descriptions.length - 1) return '0';
    return getResponsiveSpacing(breakpoints, {
      mobile: theme.spacing.xs,
      tablet: theme.spacing.md,
      desktop: theme.spacing.md,
    });
  };

  return (
    <div
      style={{
        marginBottom: cardMarginBottom,
        padding: cardPadding,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        borderLeft: `4px solid ${borderColor}`,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h3
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {emoji && (
          <span
            style={{
              fontSize: emojiFontSize,
              lineHeight: 1,
            }}
          >
            {emoji}
          </span>
        )}
        <span>{title}</span>
      </h3>
      {descriptions.map((desc, index) => (
        <p
          key={cardKey ? `${cardKey}-${index}` : `desc-${index}`}
          style={{
            fontSize: bodyFontSize,
            color: theme.colors.text.secondary,
            lineHeight: 1.7,
            marginBottom: getParagraphMarginBottom(index),
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%',
          }}
        >
          {desc}
        </p>
      ))}
    </div>
  );
};

