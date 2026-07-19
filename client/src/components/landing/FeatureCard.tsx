import React from 'react';
import { theme } from 'theme/theme';

import { getFeatureCardStyles, getParagraphMarginBottom } from 'components/landing/FeatureCardStyles';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

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
  const styles = getFeatureCardStyles(breakpoints, marginBottom);

  return (
    <div
      style={{
        marginBottom: styles.cardMarginBottom,
        padding: styles.cardPadding,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        borderLeft: `4px solid ${borderColor}`,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h3
        style={{
          fontSize: styles.headingFontSize,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: styles.headingMarginBottom,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {emoji && (
          <span
            style={{
              fontSize: styles.emojiFontSize,
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
            fontSize: styles.bodyFontSize,
            color: theme.colors.text.secondary,
            lineHeight: 1.7,
            marginBottom: getParagraphMarginBottom(breakpoints, index, descriptions.length),
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
