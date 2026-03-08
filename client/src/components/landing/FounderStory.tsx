import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FounderHeader } from 'components/landing/founder/FounderHeader';
import { FounderStoryContent } from 'components/landing/founder/FounderStoryContent';
import { getHeadingFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Founder's story section component
 * Personal story from the founder about why BearlyMail was created
 */
export const FounderStory: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const sectionMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xl,
    tablet: theme.spacing['2xl'],
    desktop: theme.spacing['3xl'],
  });

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  const quotePadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing['2xl'],
  });

  return (
    <section
      style={{
        marginBottom: sectionMarginBottom,
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
        {t('landing.founder.heading')}
      </h2>

      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: quotePadding,
          borderLeft: `4px solid ${theme.colors.primary.main}`,
          position: 'relative',
        }}
      >
        <FounderHeader />
        <div
          style={{
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%',
          }}
        >
          <FounderStoryContent />
        </div>
      </div>
    </section>
  );
};
